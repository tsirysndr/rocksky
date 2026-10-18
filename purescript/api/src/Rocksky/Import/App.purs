module Rocksky.Import.App (app, appWithState) where

import Prelude
import Consola as Log
import Data.Array as A
import Data.Either (Either(..), either)
import Data.JSDate as Date
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Nullable as N
import Data.Set as Set
import Drizzle.Builder (insertForeign, limit, offset, orderBy, run, runInsertReturning, selectFrom)
import Drizzle.Query (where_)
import Drizzle.SQL as SQL
import Drizzle.Schema (toSQL)
import Effect (Effect)
import Effect.Aff (Aff, attempt, error, message, throwError)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Foreign (Foreign)
import Hono as Hono
import Hono.Streaming as SSE
import Rocksky.Context (Context)
import Rocksky.Import.Parser as Parser
import Rocksky.Import.Service as Service
import Rocksky.Lib.Aff (forkAndForget)
import Rocksky.Lib.Foreign as F
import Rocksky.Lib.Rest as Rest
import Rocksky.Lib.Rsql (numberValue)
import Unsafe.Coerce (unsafeCoerce)
import Rocksky.Lib.VerifyToken (verifyToken)
import Rocksky.Schema as T
import Rocksky.Schema.ImportJobs (SelectImportJob)
import Rocksky.Schema.Users (SelectUser)

latest :: Context -> String -> Aff (Maybe SelectImportJob)
latest ctx userId = A.head <$> run ctx.db (selectFrom T.importJobs
  # where_ (SQL.eq (toSQL T.importJobsC.userId) (SQL.string userId))
  # orderBy [SQL.desc (toSQL T.importJobsC.createdAt)] # limit 1)

withUser :: Context -> Hono.Context -> (SelectUser -> Aff Hono.Response) -> Aff Hono.Response
withUser ctx c action = do
  found <- either (const Nothing) identity <$> attempt (Rest.resolveUser ctx c)
  case found of
    Nothing -> Rest.text c 401 "Unauthorized"
    Just user -> action user

jobView :: Service.State -> Maybe SelectImportJob -> Effect Foreign
jobView state = case _ of
  Nothing -> pure (F.toForeign N.null)
  Just job -> do
    current <- Map.lookup job.id <$> Ref.read state.current
    pure (F.mergeForeign (F.toForeign job) (F.toForeign { currentTrack: N.toNullable current }))

bad :: Hono.Context -> Int -> String -> Aff Hono.Response
bad c status msg = Rest.json c status (F.toForeign { error: msg })

queryNumber :: Hono.Context -> String -> Number -> Number
queryNumber c key fallback = case Hono.reqQuery c key >>= numberValue of
  Just n | n /= 0.0 -> n
  _ -> fallback

app :: Context -> Effect Hono.App
app ctx = Service.newState >>= appWithState ctx

appWithState :: Context -> Service.State -> Effect Hono.App
appWithState ctx state = do
  router <- Hono.new
  Hono.post router "/upload" \c -> withUser ctx c \user -> do
    existing <- latest ctx user.id
    now <- liftEffect Date.now
    case existing of
      Just job | job.status == "running" && Date.getTime now - Date.getTime job.updatedAt < 1800000.0 -> bad c 409 "An import is already running"
      _ -> do
        case existing of
          Just job | job.status == "running" -> Service.patchJob ctx job.id (F.toForeign { status: "failed" })
          _ -> pure unit
        formResult <- attempt (Hono.reqFormData c)
        case formResult of
          Left _ -> bad c 400 "Invalid multipart form data"
          Right form -> do
            let file = Hono.formValue form "file"
            case Hono.formGet form "type" of
              Just kind | not (F.isNullish file) && F.asString file /= Just "" && A.elem kind ["lastfm", "spotify"] -> do
                contents <- Hono.fileText file
                parsed <- attempt do
                  if kind == "lastfm" then pure (Parser.parseLastfmCsv contents)
                  else case F.parseJson contents of
                    Left e -> throwError (error e)
                    Right value -> liftEffect (Parser.parseSpotifyJson value)
                case parsed of
                  Left e -> bad c 400 ("Failed to parse file: " <> message e)
                  Right tracks | A.null tracks -> bad c 400 "No valid scrobbles found in file"
                  Right tracks -> do
                    jobs :: Array SelectImportJob <- runInsertReturning ctx.db (insertForeign T.importJobs [F.toForeign
                      { userId: user.id, type: kind, status: "running", total: A.length tracks, processed: 0, failed: 0 }])
                    job <- Rest.firstRow jobs
                    forkAndForget do
                      result <- attempt (Service.runImport ctx state job.id (A.sortWith (fromMaybe 0.0 <<< N.toMaybe <<< _.timestamp) tracks) user.did)
                      case result of
                        Right _ -> pure unit
                        Left e -> do
                          liftEffect (Log.error ("[import] Unhandled error in job " <> job.id <> ": " <> message e))
                          Service.patchJob ctx job.id (F.toForeign { status: "failed", errors: F.stringify (F.toForeign ["Import crashed: " <> message e]) })
                    liftEffect (Hono.json c (F.toForeign job))
              _ -> bad c 400 "Missing file or invalid type"
  Hono.get router "/status" \c -> withUser ctx c \user -> do
    job <- latest ctx user.id
    liftEffect (jobView state job >>= Hono.json c)
  Hono.get router "/jobs" \c -> withUser ctx c \user -> do
    jobs :: Array SelectImportJob <- run ctx.db (selectFrom T.importJobs
      # where_ (SQL.eq (toSQL T.importJobsC.userId) (SQL.string user.id))
      # orderBy [SQL.desc (toSQL T.importJobsC.createdAt)]
      # limit (unsafeCoerce (min 100.0 (queryNumber c "size" 20.0))) # offset (unsafeCoerce (queryNumber c "offset" 0.0)))
    liftEffect (Hono.json c (F.toForeign jobs))
  Hono.post router "/cancel" \c -> withUser ctx c \user -> do
    job <- latest ctx user.id
    case job of
      Just running | running.status == "running" -> do
        Service.patchJob ctx running.id (F.toForeign { status: "cancelled" })
        liftEffect (Ref.modify_ (Set.insert running.id) state.cancelled)
        liftEffect (Hono.json c (F.toForeign { ok: true }))
      _ -> bad c 400 "No running import to cancel"
  Hono.get router "/events" \c -> case Hono.reqQuery c "token" of
    Just token | token /= "" && token /= "null" -> do
      verified <- attempt (verifyToken ctx.db token)
      case verified of
        Left _ -> Rest.text c 401 "Unauthorized"
        Right payload -> do
          users :: Array SelectUser <- run ctx.db (selectFrom T.users # where_ (SQL.eq (toSQL T.usersC.did) (SQL.param payload.did)) # limit 1)
          case A.head users of
            Nothing -> Rest.text c 401 "Unauthorized"
            Just user -> liftEffect (SSE.streamSSE c \stream -> do
              start <- liftEffect Date.now
              let loop = do
                    now <- liftEffect Date.now
                    aborted <- liftEffect (SSE.isAborted stream)
                    when (Date.getTime now < Date.getTime start + 7200000.0 && not aborted) do
                      job <- latest ctx user.id
                      view <- liftEffect (jobView state job)
                      SSE.writeSSE stream { event: N.notNull "progress", data: F.stringify view, id: N.null }
                      case job of
                        Just current | not (A.elem current.status ["completed", "failed", "cancelled"]) -> SSE.sleep stream 1000 *> loop
                        _ -> pure unit
              loop)
    _ -> Rest.text c 401 "Unauthorized"
  pure router
