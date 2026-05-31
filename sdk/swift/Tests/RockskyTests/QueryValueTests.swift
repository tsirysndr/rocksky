import XCTest
@testable import Rocksky

final class QueryValueTests: XCTestCase {
    func testStringArrayExpandsToRepeatedQueryItems() {
        let items = QueryValue.stringArray(["a", "b", "c"]).queryItems(name: "dids")
        XCTAssertEqual(items.count, 3)
        XCTAssertEqual(items.map { $0.name }, ["dids", "dids", "dids"])
        XCTAssertEqual(items.compactMap { $0.value }, ["a", "b", "c"])
    }

    func testIntAndBoolEncoding() {
        XCTAssertEqual(QueryValue.int(42).queryItems(name: "limit").first?.value, "42")
        XCTAssertEqual(QueryValue.bool(true).queryItems(name: "following").first?.value, "true")
        XCTAssertEqual(QueryValue.bool(false).queryItems(name: "following").first?.value, "false")
    }

    func testDateEncodesAsISO8601() {
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        let value = QueryValue.date(date).queryItems(name: "startDate").first?.value
        XCTAssertNotNil(value)
        XCTAssertTrue(value?.contains("2023") ?? false)
        XCTAssertTrue(value?.hasSuffix("Z") ?? false)
    }

    func testParamsHelperSkipsNil() {
        let p = params(
            ("a", .string("x")),
            ("b", nil),
            ("c", .int(1))
        )
        XCTAssertEqual(p.count, 2)
        XCTAssertNotNil(p["a"])
        XCTAssertNil(p["b"])
        XCTAssertNotNil(p["c"])
    }
}
