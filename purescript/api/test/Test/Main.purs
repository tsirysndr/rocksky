module Test.Main (main) where

import Prelude

import Data.Either (Either(..))
import Data.Traversable (for_)
import Effect (Effect)
import Effect.Aff (Aff, Error, attempt, error, message, throwError)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Foreign (Foreign)
import Rocksky.Lib.Aff (sleep, timeoutMs)
import Rocksky.Lib.Foreign (toForeign)
import Rocksky.Typesense.Retry (isTransient, withTypesenseRetry)
import Test.Spec (describe, it)
import Test.Spec.Assertions (shouldEqual)
import Test.Spec.Reporter.Console (consoleReporter)
import Test.Spec.Runner.Node (runSpecAndExitProcess)

main :: Effect Unit
main = runSpecAndExitProcess [ consoleReporter ] do
  describe "Typesense retry policy" do
    it "recognizes network failures, server errors and nested causes" do
      for_ [ "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND", "EPIPE", "ENETUNREACH", "EHOSTUNREACH" ] \code ->
        isTransient (testError (toForeign { code })) `shouldEqual` true
      isTransient transientError `shouldEqual` true
      isTransient (testError (toForeign { cause: { httpStatus: 503 } })) `shouldEqual` true
      isTransient (testError (toForeign { httpStatus: 404 })) `shouldEqual` false
      isTransient (error "unexpected") `shouldEqual` false
    it "retries transient failures and returns the successful result" do
      calls <- liftEffect (Ref.new 0)
      result <- withTypesenseRetry do
        n <- liftEffect (Ref.modify (_ + 1) calls)
        if n < 3 then throwError transientError else pure "ok"
      result `shouldEqual` "ok"
      liftEffect (Ref.read calls) >>= (_ `shouldEqual` 3)
    it "stops after three failed attempts" do
      calls <- liftEffect (Ref.new 0)
      result <- attempt $ withTypesenseRetry do
        liftEffect (Ref.modify_ (_ + 1) calls)
        throwError transientError :: Aff Unit
      ( case result of
          Left _ -> true
          Right _ -> false
      ) `shouldEqual` true
      liftEffect (Ref.read calls) >>= (_ `shouldEqual` 3)
    it "does not retry permanent failures" do
      calls <- liftEffect (Ref.new 0)
      _ <- attempt $ withTypesenseRetry do
        liftEffect (Ref.modify_ (_ + 1) calls)
        throwError (error "invalid request") :: Aff Unit
      liftEffect (Ref.read calls) >>= (_ `shouldEqual` 1)

  describe "Operation timeouts" do
    it "preserves an immediate failure instead of replacing it with a timeout" do
      result <- attempt (timeoutMs 100 (throwError (error "original failure") :: Aff Unit))
      (case result of
        Left e -> message e
        Right _ -> "unexpected success") `shouldEqual` "original failure"
    it "returns successful operations" do
      timeoutMs 100 (pure "ready") >>= (_ `shouldEqual` "ready")
    it "cancels the losing operation when its deadline expires" do
      completed <- liftEffect (Ref.new false)
      result <- attempt (timeoutMs 10 (sleep 60 *> liftEffect (Ref.write true completed)))
      (case result of
        Left e -> message e
        Right _ -> "unexpected success") `shouldEqual` "TimeoutException: operation timed out"
      sleep 80
      liftEffect (Ref.read completed) >>= (_ `shouldEqual` false)

transientError :: Error
transientError = testError (toForeign { httpStatus: 503 })

foreign import testError :: Foreign -> Error
