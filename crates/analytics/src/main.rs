use duckdb::Connection;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open_in_memory()?;
    conn.execute_batch("CREATE TABLE items (name STRING, value INTEGER);")?;
    println!("Hello, world!");
    Ok(())
}
