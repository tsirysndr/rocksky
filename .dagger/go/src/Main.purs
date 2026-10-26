module Main where

import Prelude
import CI.Runtime as CI
import CI.Cache as Cache
import Dagger (Client)
import Dagger.Container as Container
import Dagger.Directory as Directory
import Dagger.File as File
import Dagger.Modules as Module
import Dagger.Query as Query
import Dagger.Types (Container, Directory)
import Data.Array (head, mapMaybe)
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), split, stripPrefix, trim)
import Effect (Effect)
import Effect.Aff (Aff, throwError)
import Effect.Exception (error)

-- Keep the workflow's go-version-file behavior instead of maintaining a second pin.
goVersion :: Directory -> Aff String
goVersion source = do
  manifest <- File.contents (Directory.file "go.mod" source)
  case head (mapMaybe (stripPrefix (Pattern "go ")) (split (Pattern "\n") manifest)) of
    Just version -> pure (trim version)
    Nothing -> throwError (error "go.mod must declare a Go version")

copySource :: String -> Directory -> Container -> Container
copySource destination source = Container.withDirectoryWith destination source
  (Container.defaultWithDirectoryOpts
    { exclude = Just [ ".git", ".env", ".env.*", "node_modules", "target", "dist" ] })

buildEnvironment :: Client -> Directory -> String -> Aff Container
buildEnvironment client source project = do
  version <- goVersion source
  pure $ Query.container client
    # Container.from ("golang:" <> version <> "-bookworm")
    # Container.withMountedCache "/go/pkg/mod" (Query.cacheVolume "rocksky-go-modules" client)
    # Container.withMountedCache "/root/.cache/go-build" (Query.cacheVolume "rocksky-go-build" client)
    # copySource ("/src/" <> project) source
    # Container.withWorkdir ("/src/" <> project)

sdk :: Client -> Directory -> Aff String
sdk client source = do
  environment <- buildEnvironment client source "sdk/go"
  void $ Container.sync (environment # Container.withExec [ "go", "test", "./..." ])
  pure "Go SDK tests passed"

type ServiceSources = { source :: Directory, otel :: Directory }

serviceSources :: Module.Arguments ServiceSources
serviceSources = ado
  source <- Module.argument "source"
  otel <- Module.argument "otel"
  in { source, otel }

serviceEnvironment :: Client -> ServiceSources -> String -> Aff Container
serviceEnvironment client sources project = do
  environment <- buildEnvironment client sources.source project
  -- Both services use a local replace directive pointing to ../otel.
  pure $ environment # copySource "/src/otel" sources.otel

deezer :: Client -> ServiceSources -> Aff String
deezer client source = do
  environment <- serviceEnvironment client source "deezer"
  -- DEEZER_SMOKE is intentionally unset, matching the existing unit-test job.
  void $ Container.sync (environment # Container.withExec [ "go", "test", "./..." ])
  pure "Deezer tests passed"

musicbrainz :: Client -> ServiceSources -> Aff String
musicbrainz client source = do
  environment <- serviceEnvironment client source "musicbrainz"
  void $ Container.sync $ environment
    # Container.withExec [ "go", "test", "-race", "./..." ]
    # Container.withExec [ "go", "build", "-o", "/tmp/rocksky-musicbrainz", "." ]
  pure "MusicBrainz race tests and build passed"

main :: Effect Unit
main = CI.runModule
  [ Module.object_ "GoChecks" {}
      [ Module.function "sdk" "Run Go SDK tests using sdk/go/go.mod's Go version."
          (Module.argument "source") sdk
      , Module.function "deezer" "Run Deezer unit tests with the local otel dependency."
          serviceSources deezer
      , Module.function "musicbrainz" "Run MusicBrainz race tests and build the proxy."
          serviceSources musicbrainz
      , Module.function "saveCaches" "Snapshot named cache volumes for GitHub Actions cache." Cache.cacheArgs Cache.saveCaches
      , Module.function "restoreCaches" "Restore named cache volumes before a build." Cache.restoreArgs Cache.restoreCaches
      ]
  ]
