---
name: playwright-mcp
description: Guides setup and use of the official Microsoft Playwright MCP server for browser automation, web scraping, testing, and interaction via structured accessibility snapshots. Use when configuring Playwright MCP, automating browser tasks, scraping web pages, or generating Playwright tests.
---

# Skill: Playwright MCP

> Read this before setting up or using the Playwright MCP server.

## What It Does

The official Microsoft Playwright MCP server gives Claude browser automation capabilities:
- **Navigate** web pages, go back/forward, manage tabs
- **Interact** — click, type, select, drag, upload files, handle dialogs
- **Read** page content via structured accessibility snapshots (no vision model needed)
- **Screenshot** pages or elements, save PDFs
- **Debug** — view console messages, network requests, evaluate JavaScript
- **Verify** — check element visibility, text presence, form values
- **Trace** — record Playwright traces for debugging
- **Generate** Playwright test scripts from interactions

Uses accessibility tree snapshots by default — fast, deterministic, and LLM-friendly. Vision mode (coordinate-based) available as opt-in.

## Setup in Claude Code

### Basic (headed browser, persistent profile)

```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```

Browser opens visibly and maintains login state between sessions.

### Headless (no visible browser)

```bash
claude mcp add playwright -- npx @playwright/mcp@latest --headless
```

### With capabilities

```bash
claude mcp add playwright -- npx @playwright/mcp@latest --caps="vision,pdf,verify"
```

### Specific browser

```bash
claude mcp add playwright -- npx @playwright/mcp@latest --browser=firefox
```

### Connect to existing browser (keeps your logins)

```bash
claude mcp add playwright -- npx @playwright/mcp@latest --extension
```

Requires the "Playwright MCP Bridge" browser extension.

### Verify

```
/mcp
```

## Key CLI Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `--headless` | off (headed) | Run browser without visible UI |
| `--browser` | `chrome` | Browser: `chrome`, `firefox`, `webkit`, `msedge` |
| `--caps` | — | Enable extra tools: `vision`, `pdf`, `verify`, `devtools`, `tracing` |
| `--viewport-size` | — | Viewport size: `WIDTHxHEIGHT` (e.g., `1280x720`) |
| `--device` | — | Device emulation (e.g., `"iPhone 15"`) |
| `--isolated` | off | In-memory profile, no disk persistence |
| `--extension` | off | Connect to running browser via Bridge extension |
| `--user-data-dir` | auto | Browser profile directory |
| `--proxy-server` | — | HTTP/SOCKS5 proxy (e.g., `http://host:port`) |
| `--output-dir` | — | Directory for saved files (screenshots, PDFs, traces) |
| `--codegen` | — | Generate Playwright test code: `typescript` or `none` |
| `--config` | — | Path to JSON config file |
| `--allowed-hosts` | — | Comma-separated allowed hosts (`*` = unrestricted) |
| `--blocked-origins` | — | Semicolon-separated blocked origins |
| `--ignore-https-errors` | off | Ignore SSL certificate errors |
| `--save-trace` | off | Save Playwright trace to output directory |
| `--save-video` | — | Record video (e.g., `"800x600"`) |
| `--secrets` | — | Path to `.env` file for secrets |
| `--timeout-action` | `5000` | Action timeout in ms |
| `--timeout-navigation` | `60000` | Navigation timeout in ms |

Every flag has a corresponding `PLAYWRIGHT_MCP_*` environment variable (e.g., `PLAYWRIGHT_MCP_HEADLESS`, `PLAYWRIGHT_MCP_BROWSER`).

## Available Tools

### Core Interaction (always available)

| Tool | Purpose |
|------|---------|
| `browser_click` | Click or double-click an element |
| `browser_hover` | Hover over an element |
| `browser_type` | Type text into an editable element |
| `browser_fill_form` | Fill multiple form fields at once |
| `browser_select_option` | Select dropdown values |
| `browser_press_key` | Press a keyboard key |
| `browser_drag` | Drag-and-drop between elements |
| `browser_file_upload` | Upload files |

### Navigation & Tabs

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Navigate to a URL |
| `browser_navigate_back` | Go back |
| `browser_navigate_forward` | Go forward |
| `browser_tabs` | List, create, close, or select tabs |
| `browser_close` | Close the current page |

### Page Context & Capture

| Tool | Purpose |
|------|---------|
| `browser_snapshot` | Capture accessibility snapshot (primary way to read pages) |
| `browser_take_screenshot` | Screenshot viewport, full page, or element |
| `browser_pdf_save` | Save page as PDF (requires `--caps=pdf`) |

### Debugging

| Tool | Purpose |
|------|---------|
| `browser_evaluate` | Run JavaScript in page context |
| `browser_console_messages` | Get console messages |
| `browser_network_requests` | Get network requests since page load |
| `browser_resize` | Resize browser window |
| `browser_handle_dialog` | Accept/dismiss modal dialogs |

### Verification (requires `--caps=verify`)

| Tool | Purpose |
|------|---------|
| `browser_verify_element_visible` | Verify element visible by role + accessible name |
| `browser_verify_text_visible` | Verify text string is visible |
| `browser_verify_list_visible` | Verify list with expected items is visible |
| `browser_verify_value` | Verify element values (checkbox state, input value) |

### Vision / Coordinate-Based (requires `--caps=vision`)

| Tool | Purpose |
|------|---------|
| `browser_mouse_click_xy` | Click at coordinates |
| `browser_mouse_drag_xy` | Drag between coordinates |
| `browser_mouse_move_xy` | Move mouse to coordinates |

### Tracing (requires `--caps=tracing`)

| Tool | Purpose |
|------|---------|
| `browser_start_tracing` | Start trace recording |
| `browser_stop_tracing` | Stop trace and save |

### Utility

| Tool | Purpose |
|------|---------|
| `browser_install` | Install required browser binaries |

## Workflow Pattern

The typical automation loop:

1. `browser_navigate` → go to URL
2. `browser_snapshot` → read page structure
3. `browser_click` / `browser_type` / `browser_select_option` → interact
4. `browser_snapshot` → read updated state
5. Repeat 3-4 until task complete

**80% of work** uses: `navigate`, `snapshot`, `click`, `type`, `select_option`, `press_key`, `wait_for`, `handle_dialog`.

Prefer `browser_snapshot` over `browser_take_screenshot` — snapshots are faster, cheaper (no vision model), and more deterministic.

## MSB Use Cases

### Scrape competitor pricing

```
Navigate to competitor's pricing page, snapshot the page,
and extract all plan names and prices into a table
```

### Test a client site

```
Navigate to client's contact form, fill it out with test data,
submit it, and verify the success message appears
```

### Generate Playwright tests

Use `--codegen=typescript` flag, then interact with the site — Playwright generates test code from your actions.

### Screenshot client deliverables

```
Navigate to the deployed dashboard, take a full-page screenshot,
and save it to ~/Documents/msb/demos/
```

## Safety Rules

- **Use `--allowed-hosts`** to restrict which domains the browser can visit.
- **Use `--blocked-origins`** to block sensitive domains (e.g., banking, email).
- **Don't automate login to accounts** without explicit user approval.
- **Use `--isolated`** for throwaway sessions that shouldn't persist cookies.
- **Review `browser_evaluate` calls** — they execute arbitrary JS in the page.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Browser doesn't open | Run `browser_install` tool first, or `npx playwright install chromium` |
| `spawn npx ENOENT` | Node.js not in PATH — install Node 18+ |
| Slow on large pages | Use `--snapshot-mode=incremental` (default) to avoid full-page snapshots |
| Can't interact with element | Use `browser_snapshot` to find the correct element reference |
| SSL errors on localhost | Add `--ignore-https-errors` flag |
| Profile conflicts | Use `--isolated` for clean sessions |
| Need logins preserved | Use `--extension` with the Playwright MCP Bridge extension |
