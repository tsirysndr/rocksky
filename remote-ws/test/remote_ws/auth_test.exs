defmodule RemoteWs.AuthTest do
  use RemoteWs.Test.Case
  alias RemoteWs.Auth

  test "verifies a valid token and extracts did" do
    token = Token.sign(%{"did" => "did:plc:alice"})
    assert {:ok, %{did: "did:plc:alice"}} = Auth.verify_token(token)
  end

  test "rejects a token signed with a different secret" do
    signer = Joken.Signer.create("HS256", "wrong-secret")
    {:ok, token} = Joken.Signer.sign(%{"did" => "x"}, signer)
    assert {:error, _} = Auth.verify_token(token)
  end

  test "access_token type is revoked when jti not in store" do
    token = Token.sign(%{"did" => "d", "type" => "access_token", "jti" => "j1"})
    assert {:error, :revoked} = Auth.verify_token(token)
  end

  test "access_token type is accepted when jti still exists" do
    StoreStub.put_token("j2")
    token = Token.sign(%{"did" => "d", "type" => "access_token", "jti" => "j2"})
    assert {:ok, %{did: "d"}} = Auth.verify_token(token)
  end

  test "ignores expiration (mirrors jwt.verify ignoreExpiration)" do
    token = Token.sign(%{"did" => "d", "exp" => 1})
    assert {:ok, %{did: "d"}} = Auth.verify_token(token)
  end

  test "empty / non-string bearer is invalid" do
    assert {:error, _} = Auth.verify_token("")
    assert {:error, _} = Auth.verify_token(nil)
  end
end
