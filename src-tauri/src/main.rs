// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `quirkus mcp` runs the MCP server on stdio instead of opening the app.
    if std::env::args().nth(1).as_deref() == Some("mcp") {
        std::process::exit(quirkus_lib::mcp::main());
    }
    quirkus_lib::run()
}
