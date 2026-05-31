import Foundation

public struct ApikeyAPI: Sendable {
    let transport: XRPCTransport

    public func getApikeys(limit: Int? = nil, offset: Int? = nil) async throws -> ApikeysResponse {
        try await transport.query(
            "app.rocksky.apikey.getApikeys",
            params: params(
                ("limit", limit.map { .int($0) }),
                ("offset", offset.map { .int($0) })
            )
        )
    }

    public func createApikey(_ input: CreateApikeyInput) async throws -> ApikeyView {
        try await transport.procedure(
            "app.rocksky.apikey.createApikey",
            body: input
        )
    }

    /// Convenience overload — `try await client.apikey.createApikey(name: "ci")`.
    @discardableResult
    public func createApikey(name: String, description: String? = nil) async throws -> ApikeyView {
        try await createApikey(CreateApikeyInput(name: name, description: description))
    }

    public func updateApikey(_ input: UpdateApikeyInput) async throws -> ApikeyView {
        try await transport.procedure(
            "app.rocksky.apikey.updateApikey",
            body: input
        )
    }

    /// Convenience overload — `try await client.apikey.updateApikey(id: "...", name: "new")`.
    @discardableResult
    public func updateApikey(id: String, name: String, description: String? = nil) async throws -> ApikeyView {
        try await updateApikey(UpdateApikeyInput(id: id, name: name, description: description))
    }

    public func removeApikey(id: String) async throws -> ApikeyView {
        try await transport.procedure(
            "app.rocksky.apikey.removeApikey",
            params: params(("id", .string(id))),
            body: Optional<EmptyResponse>.none,
            as: ApikeyView.self
        )
    }
}
