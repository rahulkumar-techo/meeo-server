/**
 * Self-contained HTML Documentation Page served at /docs/description.
 * Provides a comprehensive, searchable, interactive developer guide for all API modules and routes.
 */

export const docsDescriptionHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>E-Commerce Enterprise API Documentation</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-main: #0B0F19;
            --bg-card: #111827;
            --bg-card-hover: #1F2937;
            --border-color: rgba(255, 255, 255, 0.08);
            --primary: #6366F1;
            --primary-light: #818CF8;
            --primary-glow: rgba(99, 102, 241, 0.25);
            --accent-green: #10B981;
            --accent-amber: #F59E0B;
            --accent-rose: #F43F5E;
            --accent-sky: #0EA5E9;
            --text-main: #F9FAFB;
            --text-muted: #9CA3AF;
            --font-sans: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            --font-mono: 'JetBrains Mono', monospace;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--font-sans);
            background-color: var(--bg-main);
            color: var(--text-main);
            line-height: 1.6;
            overflow-x: hidden;
        }

        /* Top Header */
        header {
            position: sticky;
            top: 0;
            z-index: 100;
            background: rgba(11, 15, 25, 0.85);
            backdrop-filter: blur(16px);
            border-bottom: 1px solid var(--border-color);
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .brand-logo {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-weight: 800;
            font-size: 1.25rem;
            color: #fff;
            text-decoration: none;
        }

        .badge-version {
            font-size: 0.75rem;
            padding: 0.2rem 0.6rem;
            border-radius: 9999px;
            background: rgba(99, 102, 241, 0.15);
            color: var(--primary-light);
            border: 1px solid rgba(99, 102, 241, 0.3);
            font-family: var(--font-mono);
        }

        .nav-links {
            display: flex;
            gap: 1.25rem;
            align-items: center;
        }

        .nav-links a {
            color: var(--text-muted);
            text-decoration: none;
            font-size: 0.9rem;
            font-weight: 600;
            transition: color 0.2s;
        }

        .nav-links a:hover {
            color: #fff;
        }

        .btn-swagger {
            background: linear-gradient(135deg, #6366F1, #4F46E5);
            color: #fff !important;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            box-shadow: 0 4px 14px var(--primary-glow);
        }

        /* Layout */
        .container {
            display: flex;
            max-width: 1600px;
            margin: 0 auto;
            min-height: calc(100vh - 70px);
        }

        /* Sidebar Navigation */
        aside {
            width: 320px;
            position: sticky;
            top: 70px;
            height: calc(100vh - 70px);
            overflow-y: auto;
            padding: 1.5rem 1rem;
            border-right: 1px solid var(--border-color);
            background: rgba(17, 24, 39, 0.4);
        }

        aside::-webkit-scrollbar {
            width: 4px;
        }
        aside::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        }

        .sidebar-search {
            margin-bottom: 1.25rem;
        }

        .sidebar-search input {
            width: 100%;
            background: #1F2937;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 0.6rem 0.8rem;
            color: #fff;
            font-size: 0.875rem;
            font-family: var(--font-sans);
            outline: none;
        }

        .sidebar-search input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 2px var(--primary-glow);
        }

        .menu-category {
            font-size: 0.75rem;
            text-transform: uppercase;
            font-weight: 700;
            color: var(--text-muted);
            letter-spacing: 0.05em;
            margin: 1.25rem 0 0.5rem 0.5rem;
        }

        .menu-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 0.75rem;
            color: #D1D5DB;
            text-decoration: none;
            border-radius: 6px;
            font-size: 0.875rem;
            font-weight: 500;
            transition: all 0.15s;
            margin-bottom: 0.2rem;
        }

        .menu-item:hover, .menu-item.active {
            background: rgba(99, 102, 241, 0.15);
            color: #fff;
            border-left: 3px solid var(--primary);
        }

        /* Main Content */
        main {
            flex: 1;
            padding: 2.5rem 3.5rem;
            max-width: 1280px;
            overflow-y: auto;
        }

        .hero {
            margin-bottom: 3rem;
            padding-bottom: 2rem;
            border-bottom: 1px solid var(--border-color);
        }

        .hero h1 {
            font-size: 2.5rem;
            font-weight: 800;
            margin-bottom: 0.75rem;
            background: linear-gradient(135deg, #FFFFFF 0%, #A5B4FC 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .hero p {
            font-size: 1.1rem;
            color: var(--text-muted);
            max-width: 900px;
        }

        /* Architecture Card Grid */
        .card-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 1.5rem;
            margin: 2rem 0;
        }

        .card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.5rem;
            transition: transform 0.2s, border-color 0.2s;
        }

        .card:hover {
            transform: translateY(-2px);
            border-color: rgba(99, 102, 241, 0.4);
        }

        .card-icon {
            font-size: 1.75rem;
            margin-bottom: 0.75rem;
        }

        .card h3 {
            font-size: 1.15rem;
            margin-bottom: 0.5rem;
            color: #fff;
        }

        .card p {
            font-size: 0.9rem;
            color: var(--text-muted);
        }

        /* Section Styling */
        section {
            margin-bottom: 4rem;
            scroll-margin-top: 90px;
        }

        section h2 {
            font-size: 1.75rem;
            font-weight: 700;
            margin-bottom: 1rem;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .section-desc {
            color: var(--text-muted);
            margin-bottom: 1.5rem;
            font-size: 0.95rem;
        }

        /* Tables */
        .table-wrap {
            overflow-x: auto;
            border: 1px solid var(--border-color);
            border-radius: 10px;
            margin: 1.5rem 0;
            background: var(--bg-card);
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
            font-size: 0.875rem;
        }

        th {
            background: rgba(255, 255, 255, 0.03);
            color: var(--text-muted);
            font-weight: 600;
            padding: 0.85rem 1rem;
            border-bottom: 1px solid var(--border-color);
        }

        td {
            padding: 0.85rem 1rem;
            border-bottom: 1px solid var(--border-color);
            color: #E5E7EB;
        }

        tr:last-child td {
            border-bottom: none;
        }

        tr:hover td {
            background: rgba(255, 255, 255, 0.02);
        }

        /* HTTP Method Badges */
        .method {
            display: inline-block;
            font-family: var(--font-mono);
            font-weight: 700;
            font-size: 0.75rem;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            text-transform: uppercase;
        }
        .method.get { background: rgba(16, 185, 129, 0.15); color: #34D399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .method.post { background: rgba(14, 165, 233, 0.15); color: #38BDF8; border: 1px solid rgba(14, 165, 233, 0.3); }
        .method.patch { background: rgba(245, 158, 11, 0.15); color: #FBBF24; border: 1px solid rgba(245, 158, 11, 0.3); }
        .method.put { background: rgba(168, 85, 247, 0.15); color: #C084FC; border: 1px solid rgba(168, 85, 247, 0.3); }
        .method.delete { background: rgba(244, 63, 94, 0.15); color: #FB7185; border: 1px solid rgba(244, 63, 94, 0.3); }

        /* Access Badges */
        .access-badge {
            font-family: var(--font-mono);
            font-size: 0.7rem;
            padding: 0.15rem 0.5rem;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.08);
            color: #E0E7FF;
            display: inline-block;
        }
        .access-badge.public { background: rgba(16, 185, 129, 0.15); color: #6EE7B7; }
        .access-badge.user { background: rgba(14, 165, 233, 0.15); color: #7DD3FC; }
        .access-badge.creator { background: rgba(245, 158, 11, 0.15); color: #FCD34D; }
        .access-badge.admin { background: rgba(239, 68, 68, 0.15); color: #FCA5A5; }

        /* Code & Pre Blocks */
        pre {
            background: #0D1117;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem;
            font-family: var(--font-mono);
            font-size: 0.85rem;
            color: #E6EDF3;
            overflow-x: auto;
            margin: 1rem 0;
        }

        code {
            font-family: var(--font-mono);
            background: rgba(255, 255, 255, 0.08);
            padding: 0.15rem 0.4rem;
            border-radius: 4px;
            font-size: 0.85em;
            color: #E0E7FF;
        }

        pre code {
            background: none;
            padding: 0;
        }

        /* Flow Diagrams */
        .diagram-box {
            background: #090D16;
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 12px;
            padding: 1.5rem;
            margin: 1.5rem 0;
            font-family: var(--font-mono);
            font-size: 0.85rem;
            line-height: 1.5;
            color: #C7D2FE;
            overflow-x: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        }

        /* Alert Callouts */
        .callout {
            border-left: 4px solid var(--primary);
            background: rgba(99, 102, 241, 0.08);
            padding: 1rem 1.25rem;
            border-radius: 0 8px 8px 0;
            margin: 1.5rem 0;
            font-size: 0.9rem;
        }
        .callout.amber {
            border-left-color: var(--accent-amber);
            background: rgba(245, 158, 11, 0.08);
        }

        @media (max-width: 1024px) {
            aside { display: none; }
            main { padding: 1.5rem; }
        }
    </style>
</head>
<body>

    <!-- Header Navigation -->
    <header>
        <a href="#" class="brand-logo">
            <span>🛒 E-Commerce API</span>
            <span class="badge-version">v1.0.0</span>
        </a>
        <div class="nav-links">
            <a href="/docs" target="_blank" class="btn-swagger">⚡ Open Swagger UI</a>
        </div>
    </header>

    <div class="container">
        <!-- Sidebar Menu -->
        <aside>
            <div class="sidebar-search">
                <input type="text" id="routeSearch" placeholder="🔍 Filter routes..." oninput="filterRoutes()">
            </div>

            <div class="menu-category">Getting Started</div>
            <a href="#overview" class="menu-item">🏛️ System Architecture</a>
            <a href="#access-matrix" class="menu-item">🔐 Access Control Matrix</a>
            <a href="#auth-flow" class="menu-item">🔑 Authentication Flow</a>

            <div class="menu-category">Modules & Endpoints</div>
            <a href="#auth" class="menu-item">🔐 Auth & Sessions</a>
            <a href="#user" class="menu-item">👤 User & Addresses</a>
            <a href="#authorization" class="menu-item">👑 Admin RBAC</a>
            <a href="#categories" class="menu-item">📁 Categories & Hierarchy</a>
            <a href="#brands" class="menu-item">🏷️ Brands</a>
            <a href="#products" class="menu-item">📦 Products</a>
            <a href="#variants" class="menu-item">🔢 Product Variants</a>
            <a href="#images" class="menu-item">🖼️ Images & ImageKit</a>
            <a href="#inventory" class="menu-item">📊 Inventory & Reservations</a>
            <a href="#cart" class="menu-item">🛒 Cart & Merge</a>
            <a href="#wishlist" class="menu-item">💖 Wishlist</a>
            <a href="#orders" class="menu-item">🛍️ Orders & Checkout</a>
            <a href="#payments" class="menu-item">💳 Payments & Webhooks</a>
            <a href="#outbox" class="menu-item">⚡ Transactional Outbox</a>
            <a href="#notifications" class="menu-item">🔔 Notifications</a>
            <a href="#coupons" class="menu-item">🏷️ Coupons & Promotions</a>
            <a href="#reviews" class="menu-item">⭐ Reviews & Ratings</a>
            <a href="#search" class="menu-item">🔍 Search & Discovery</a>
            <a href="#simulation" class="menu-item">🧪 Checkout Simulation</a>
        </aside>

        <!-- Main Documentation Body -->
        <main>
            <!-- Hero -->
            <div class="hero">
                <h1>Enterprise E-Commerce API Manual</h1>
                <p>Comprehensive developer reference detailing domain architecture, role-based access controls, entity lifecycles, and complete endpoint specifications.</p>
            </div>

            <!-- Architecture Overview -->
            <section id="overview">
                <h2>🏛️ System Architecture</h2>
                <p class="section-desc">The application follows a clean, modular design pattern ensuring zero coupling between request validation, business logic, and database persistence.</p>

                <div class="card-grid">
                    <div class="card">
                        <div class="card-icon">⚡</div>
                        <h3>Fastify & TypeScript</h3>
                        <p>High-throughput, asynchronous request processing with exact optional property checking.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">🔐</div>
                        <h3>Granular RBAC + Ownership</h3>
                        <p>Capability-based guards combined with creator ownership verification on all catalog and user entities.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">📦</div>
                        <h3>Multi-Variant Matrix</h3>
                        <p>Real-world multi-attribute variations (Size, Color, Material) with independent pricing, barcodes, and SKUs.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">🛡️</div>
                        <h3>Overselling Protection</h3>
                        <p>Interactive database transactions with 15-minute TTL reservation holds prevent stock contention.</p>
                    </div>
                </div>
            </section>

            <!-- Access Control Matrix -->
            <section id="access-matrix">
                <h2>🔐 Access Control & Authorization Model</h2>
                <p class="section-desc">Every route in the API displays an explicit badge specifying authentication rules and required capabilities:</p>

                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Access Badge</th>
                                <th>Target Audience</th>
                                <th>Permission Rules & Ownership Constraints</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Unauthenticated Visitors</td>
                                <td>No credentials required. Public storefront browsing, category trees, login, and registration.</td>
                            </tr>
                            <tr>
                                <td><span class="access-badge user">[Public / Cookie]</span></td>
                                <td>Token Refresh Clients</td>
                                <td>Requires a valid <code>refreshToken</code> stored in an HttpOnly secure cookie.</td>
                            </tr>
                            <tr>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Logged-in Customers</td>
                                <td>Requires <code>Authorization: Bearer &lt;JWT&gt;</code>. Manages own profile, addresses, sessions, and checkout reservations.</td>
                            </tr>
                            <tr>
                                <td><span class="access-badge creator">[Creator OR Admin: &lt;perm&gt;]</span></td>
                                <td>Resource Creator OR Staff</td>
                                <td>Permitted if <code>createdById === user.id</code> <strong>OR</strong> caller holds the listed permission (e.g. <code>product:update</code>).</td>
                            </tr>
                            <tr>
                                <td><span class="access-badge admin">[Admin: &lt;perm&gt;]</span></td>
                                <td>Staff / Administrators</td>
                                <td>Requires explicit granular RBAC capability (e.g. <code>role:create</code>, <code>user:update</code>, <code>inventory:update</code>).</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Auth -->
            <section id="auth">
                <h2>🔐 Auth & Session Management</h2>
                <p class="section-desc">Email and OTP authentication, JWT token issuance, multi-device tracking, and session revocation.</p>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/auth/register</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Register account with email & password. Sends 4-digit verification code.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/auth/verify-otp</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Verifies 4-digit email OTP and marks account as verified.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/auth/login</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Authenticates credentials, creates a trackable session, sets refresh cookie, and returns access token.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/auth/refresh</code></td>
                                <td><span class="access-badge user">[Public / Cookie]</span></td>
                                <td>Exchanges valid HttpOnly refresh cookie for a fresh access token.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/auth/logout</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Revokes active session in database and clears refresh cookie.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/auth/logout-all</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Revokes all active sessions across all devices for the current user.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/auth/sessions</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Lists all active devices and login sessions for current user.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/auth/me</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Returns profile data, assigned roles, and granular permissions.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: User -->
            <section id="user">
                <h2>👤 User Profile & Address Book</h2>
                <p class="section-desc">Customer profile customization, multiple shipping/billing addresses, and phone verification.</p>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method patch">PATCH</span></td>
                                <td><code>/api/user/profile</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Update current user name and profile fields.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/user/addresses</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Add a new shipping or billing address.</td>
                            </tr>
                            <tr>
                                <td><span class="method patch">PATCH</span></td>
                                <td><code>/api/user/addresses/:addressId</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Update saved address owned by current user.</td>
                            </tr>
                            <tr>
                                <td><span class="method delete">DELETE</span></td>
                                <td><code>/api/user/addresses/:addressId</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Delete saved address owned by current user.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/user/phone/request-otp</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Send SMS OTP for phone verification.</td>
                            </tr>
                            <tr>
                                <td><span class="method put">PUT</span></td>
                                <td><code>/api/user/phone</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Verify phone number using OTP code.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Authorization -->
            <section id="authorization">
                <h2>👑 Admin RBAC & Role Management</h2>
                <p class="section-desc">Granular role and permission administration, user role assignments, and session revocation.</p>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/v1/admin/roles</code></td>
                                <td><span class="access-badge admin">[Admin: role:create]</span></td>
                                <td>Create a new RBAC system role.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/v1/admin/roles</code></td>
                                <td><span class="access-badge admin">[Admin: role:read]</span></td>
                                <td>List all roles and granted permissions.</td>
                            </tr>
                            <tr>
                                <td><span class="method put">PUT</span></td>
                                <td><code>/api/v1/admin/roles/:roleId/permissions</code></td>
                                <td><span class="access-badge admin">[Admin: role:update]</span></td>
                                <td>Atomically replace permissions granted to a role.</td>
                            </tr>
                            <tr>
                                <td><span class="method put">PUT</span></td>
                                <td><code>/api/v1/admin/users/:userId/roles</code></td>
                                <td><span class="access-badge admin">[Admin: user:update]</span></td>
                                <td>Assign or replace roles for a target user.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/v1/admin/users</code></td>
                                <td><span class="access-badge admin">[Admin: user:read]</span></td>
                                <td>List users with roles, status, and activity.</td>
                            </tr>
                            <tr>
                                <td><span class="method delete">DELETE</span></td>
                                <td><code>/api/v1/admin/users/:userId/sessions/:sessionId</code></td>
                                <td><span class="access-badge admin">[Admin: user:update]</span></td>
                                <td>Forcibly terminate a session for any user.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Categories -->
            <section id="categories">
                <h2>📁 Category Hierarchy & Tree</h2>
                <p class="section-desc">Recursive parent-child organization, breadcrumbs, and automated child reassignment upon category deletion.</p>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/v1/categories</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>List categories with search, parent filter, and pagination.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/v1/categories/tree</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Returns recursive category tree with nested children.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/v1/categories</code></td>
                                <td><span class="access-badge admin">[Admin: category:create]</span></td>
                                <td>Create category. Sets <code>createdById</code> to authenticated user.</td>
                            </tr>
                            <tr>
                                <td><span class="method patch">PATCH</span></td>
                                <td><code>/api/v1/categories/:id</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: category:update]</span></td>
                                <td>Update category name, slug, parent, or status.</td>
                            </tr>
                            <tr>
                                <td><span class="method delete">DELETE</span></td>
                                <td><code>/api/v1/categories/:id</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: category:delete]</span></td>
                                <td>Deletes category and reassigns child subcategories to parent.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Brands -->
            <section id="brands">
                <h2>🏷️ Brands / Manufacturers</h2>
                <p class="section-desc">Brand entity tracking, logos, and catalog association.</p>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/v1/brands</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>List all brands with product counts and search.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/v1/brands</code></td>
                                <td><span class="access-badge admin">[Admin: brand:create]</span></td>
                                <td>Create brand entity. Sets <code>createdById</code> to creator.</td>
                            </tr>
                            <tr>
                                <td><span class="method patch">PATCH</span></td>
                                <td><code>/api/v1/brands/:id</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: brand:update]</span></td>
                                <td>Update brand name, slug, or logo URL.</td>
                            </tr>
                            <tr>
                                <td><span class="method delete">DELETE</span></td>
                                <td><code>/api/v1/brands/:id</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: brand:delete]</span></td>
                                <td>Delete brand (blocked if active products attached).</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Products -->
            <section id="products">
                <h2>📦 Product Catalog & Lifecycle</h2>
                <p class="section-desc">Product entity management with draft, active, and archive states, plus rich SEO fields.</p>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/v1/products</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>List products with category, brand, and search filters.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/v1/products/:id</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Get complete product record with variants and image gallery.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/v1/products</code></td>
                                <td><span class="access-badge admin">[Admin: product:create]</span></td>
                                <td>Create product in DRAFT status.</td>
                            </tr>
                            <tr>
                                <td><span class="method patch">PATCH</span></td>
                                <td><code>/api/v1/products/:id</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: product:update]</span></td>
                                <td>Update product details, SEO fields, or category.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/v1/products/:id/publish</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: product:update]</span></td>
                                <td>Publish product to ACTIVE status for storefront display.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/v1/products/:id/draft</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: product:update]</span></td>
                                <td>Move product back to DRAFT status.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/v1/products/:id/archive</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: product:update]</span></td>
                                <td>Move product to ARCHIVED status.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Product Variants -->
            <section id="variants">
                <h2>🔢 Product Variants (SKUs, Pricing, Attributes)</h2>
                <p class="section-desc">Multi-variant options (Size, Color, Material) with independent SKUs, barcodes, and pricing tiers.</p>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/v1/products/:productId/variants</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>List all variants belonging to a specific product.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/v1/products/:productId/variants</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: product:update]</span></td>
                                <td>Create single variant with SKU, price, and initial stock.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/v1/products/:productId/variants/batch</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: product:update]</span></td>
                                <td>Transactionally batch create multiple variants (e.g. Size & Color matrix).</td>
                            </tr>
                            <tr>
                                <td><span class="method patch">PATCH</span></td>
                                <td><code>/api/v1/variants/:id</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: product:update]</span></td>
                                <td>Update variant pricing (Price, Compare-at, Cost), SKU, or attributes.</td>
                            </tr>
                            <tr>
                                <td><span class="method delete">DELETE</span></td>
                                <td><code>/api/v1/variants/:id</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: product:delete]</span></td>
                                <td>Delete variant and associated inventory records.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Images -->
            <section id="images">
                <h2>🖼️ Product Images & ImageKit CDN</h2>
                <p class="section-desc">Client-side ImageKit authentication token generation, gallery uploads, and sequence reordering.</p>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/v1/products/images/auth</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Generate ImageKit client-side upload token, signature, and expiration.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/v1/products/:id/images/upload</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: product:update]</span></td>
                                <td>Upload image binary/base64 to ImageKit and attach to product.</td>
                            </tr>
                            <tr>
                                <td><span class="method put">PUT</span></td>
                                <td><code>/api/v1/products/:id/images/reorder</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: product:update]</span></td>
                                <td>Reorder image gallery sequence for storefront carousel.</td>
                            </tr>
                            <tr>
                                <td><span class="method delete">DELETE</span></td>
                                <td><code>/api/v1/products/:id/images/:imageId</code></td>
                                <td><span class="access-badge creator">[Creator OR Admin: product:update]</span></td>
                                <td>Remove image from product gallery and ImageKit CDN.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Inventory -->
            <section id="inventory">
                <h2>📊 Inventory Management & Reservations</h2>
                <p class="section-desc">Real-time stock tracking, 15-minute TTL checkout reservations, auto-expiration sweeps, and immutable audit logs.</p>

                <div class="diagram-box">
[Available Stock]
       │
       ▼  (Customer Checkout: POST /api/inventory/reservations/reserve)
[ACTIVE Reservation]  <-- 15-Minute TTL Hold Window
   │            │
   │ Success    │ Failed / Cancelled / TTL Elapsed
   ▼            ▼
[CONFIRMED]   [RELEASED / EXPIRED]
(Committed)   (Stock Restored to Available Pool)
                </div>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/inventory/variant/:variantId</code></td>
                                <td><span class="access-badge admin">[Admin: inventory:read]</span></td>
                                <td>Get available, reserved, and total stock for a variant.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/inventory/low-stock</code></td>
                                <td><span class="access-badge admin">[Admin: inventory:read]</span></td>
                                <td>List variants currently at or below reorder threshold.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/inventory/add-stock</code></td>
                                <td><span class="access-badge admin">[Admin: inventory:update]</span></td>
                                <td>Add physical stock and log <code>STOCK_ADDED</code> transaction.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/inventory/remove-stock</code></td>
                                <td><span class="access-badge admin">[Admin: inventory:update]</span></td>
                                <td>Remove damaged/shrinkage stock with overselling protection.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/inventory/adjust</code></td>
                                <td><span class="access-badge admin">[Admin: inventory:update]</span></td>
                                <td>Synchronize physical count with audit note.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/inventory/transactions</code></td>
                                <td><span class="access-badge admin">[Admin: inventory:read]</span></td>
                                <td>Paginated immutable stock movement audit ledger.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/inventory/reservations/reserve</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Reserve stock with TTL hold window for checkout session.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/inventory/reservations/:id/confirm</code></td>
                                <td><span class="access-badge admin">[Admin: inventory:update]</span></td>
                                <td>Confirm reservation and permanently commit stock on payment.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/inventory/reservations/:id/release</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Release reservation and restore stock on payment failure/cancel.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/inventory/reservations/cleanup-expired</code></td>
                                <td><span class="access-badge admin">[Admin: inventory:update]</span></td>
                                <td>Sweeper endpoint to auto-expire stale holds and restore stock.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Cart & Shopping Bag -->
            <section id="cart">
                <h2>🛒 Shopping Cart & Guest Merge</h2>
                <p class="section-desc">Supports both anonymous guest carts (identified by <code>x-session-id</code> header) and authenticated user carts. Handles real-time inventory stock checks, subtotal calculations, guest-to-user cart merging upon login, and automatic TTL expiration.</p>

                <div class="card-grid">
                    <div class="card">
                        <div class="card-icon">🪪</div>
                        <h3>Guest Cart TTL</h3>
                        <p>Guest carts are tracked via the <code>x-session-id</code> header with a 7-day expiration window. Expired carts are automatically cleaned up.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">🔀</div>
                        <h3>Seamless Cart Merge</h3>
                        <p>When a guest logs in, calling <code>POST /api/cart/merge</code> merges their guest items into their permanent cart, combining quantities and enforcing stock limits.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">🛡️</div>
                        <h3>Real-Time Stock Checks</h3>
                        <p>Adding and updating item quantities immediately checks physical stock availability to prevent overselling.</p>
                    </div>
                </div>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Badge</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/cart</code></td>
                                <td><span class="access-badge public">[Guest / User]</span></td>
                                <td>Retrieve current cart with calculated item subtotals, overall cart subtotal, and stock alerts.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/cart/items</code></td>
                                <td><span class="access-badge public">[Guest / User]</span></td>
                                <td>Add a variant to the cart (validates inventory stock limits).</td>
                            </tr>
                            <tr>
                                <td><span class="method patch">PATCH</span></td>
                                <td><code>/api/cart/items/:itemId</code></td>
                                <td><span class="access-badge public">[Guest / User]</span></td>
                                <td>Update item quantity in cart (setting quantity to 0 removes the item).</td>
                            </tr>
                            <tr>
                                <td><span class="method delete">DELETE</span></td>
                                <td><code>/api/cart/items/:itemId</code></td>
                                <td><span class="access-badge public">[Guest / User]</span></td>
                                <td>Remove a specific item from the cart.</td>
                            </tr>
                            <tr>
                                <td><span class="method delete">DELETE</span></td>
                                <td><code>/api/cart</code></td>
                                <td><span class="access-badge public">[Guest / User]</span></td>
                                <td>Clear all items in the cart.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/cart/merge</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Merge guest cart items into authenticated user's permanent cart.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/cart/cleanup</code></td>
                                <td><span class="access-badge admin">[Admin: system:manage]</span></td>
                                <td>Clean up expired guest carts past their 7-day TTL.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Wishlist -->
            <section id="wishlist">
                <h2>💖 Wishlist & Saved Products</h2>
                <p class="section-desc">Enables authenticated customers to save favorite products, browse their wishlist with thumbnail previews and live price ranges, and seamlessly transfer saved items directly into their shopping cart.</p>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Badge</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/wishlist</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>View user's wishlist with product details, active variants, starting price, and stock status.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/wishlist/products/:productId</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Add a product to wishlist (idempotent operation).</td>
                            </tr>
                            <tr>
                                <td><span class="method delete">DELETE</span></td>
                                <td><code>/api/wishlist/products/:productId</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Remove a product from user's wishlist.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/wishlist/products/:productId/move-to-cart</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Directly add a saved product (or chosen variant) to cart and remove it from wishlist.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Orders & Transactional Checkout -->
            <section id="orders">
                <h2>🛍️ Orders & Transactional Checkout</h2>
                <p class="section-desc">Atomic checkout engine guaranteeing consistency across price re-verification, stock reservation holds, promotional coupon limits, immutable item snapshots, delivery address captures, and safe request deduplication via <code>Idempotency-Key</code>.</p>

                <div class="card-grid">
                    <div class="card">
                        <div class="card-icon">⚡</div>
                        <h3>Atomic Transaction</h3>
                        <p>The entire checkout pipeline executes in an all-or-nothing database transaction preventing partial checkouts or inconsistent stock states.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">🔁</div>
                        <h3>Idempotent Safety</h3>
                        <p>Duplicate checkout requests with identical <code>Idempotency-Key</code> headers return the cached order result immediately without double-charging or creating duplicate orders.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">📸</div>
                        <h3>Immutable Snapshots</h3>
                        <p>Item prices, SKU, product titles, attribute variants, and delivery addresses are snapshotted permanently on the order.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">📜</div>
                        <h3>Status Audit Trail</h3>
                        <p>Every lifecycle update (PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED) writes an immutable record to <code>OrderStatusHistory</code>.</p>
                    </div>
                </div>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Badge</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/orders/validate-checkout</code></td>
                                <td><span class="access-badge public">[Public / User]</span></td>
                                <td>Preview price calculation, coupon discounts, shipping fees, and taxes without creating an order.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/orders/checkout</code></td>
                                <td><span class="access-badge public">[Public / User]</span></td>
                                <td>Execute atomic checkout, reserve stock, apply coupons, snapshot items & address, and clear cart.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/orders</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>List customer's past orders with status and date filtering.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/orders/:id</code></td>
                                <td><span class="access-badge user">[User / Admin]</span></td>
                                <td>Retrieve full order details by ID with item snapshots and status history.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/orders/number/:orderNumber</code></td>
                                <td><span class="access-badge user">[User / Admin]</span></td>
                                <td>Lookup order details by human order number (e.g. ORD-20260906-AB123).</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/orders/:id/cancel</code></td>
                                <td><span class="access-badge user">[User / Admin]</span></td>
                                <td>Cancel order and release reserved stock back to available inventory.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/orders/:id/confirm</code></td>
                                <td><span class="access-badge admin">[Admin: order:update]</span></td>
                                <td>Explicitly confirm order for fulfillment and commit stock holds.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/orders/:id/process</code></td>
                                <td><span class="access-badge admin">[Admin: order:update]</span></td>
                                <td>Move confirmed order to PROCESSING for warehouse packaging.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/orders/:id/ship</code></td>
                                <td><span class="access-badge admin">[Admin: order:update]</span></td>
                                <td>Mark order as SHIPPED with courier carrier and tracking number.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/orders/:id/deliver</code></td>
                                <td><span class="access-badge admin">[Admin: order:update]</span></td>
                                <td>Mark order as DELIVERED upon proof of delivery receipt.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/orders/expire-stale</code></td>
                                <td><span class="access-badge admin">[Admin: order:update]</span></td>
                                <td>Sweep abandoned checkout sessions and expire stock holds past TTL window.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/orders/admin</code></td>
                                <td><span class="access-badge admin">[Admin: order:read]</span></td>
                                <td>Admin search and view across all orders in the system.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/orders/admin/metrics</code></td>
                                <td><span class="access-badge admin">[Admin: order:read]</span></td>
                                <td>Aggregated fulfillment analytics (sales volume, average order value, status breakdown).</td>
                            </tr>
                            <tr>
                                <td><span class="method patch">PATCH</span></td>
                                <td><code>/api/orders/:id/status</code></td>
                                <td><span class="access-badge admin">[Admin: order:update]</span></td>
                                <td>Update order status with state machine transition checks and audit trail.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Payments & Transactions -->
            <section id="payments">
                <h2>💳 Payments, Webhooks & Transactions</h2>
                <p class="section-desc">Multi-provider payment gateway integration (Mock, Stripe, Razorpay), discrete payment attempts, cryptographic webhook verification, duplicate event deduplication, transactional fulfillment, and full/partial refunds.</p>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/payments/initialize</code></td>
                                <td><span class="access-badge user">[User / Public]</span></td>
                                <td>Initializes payment session with chosen provider (Mock, Stripe, Razorpay) for an order in PENDING status.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/payments/retry</code></td>
                                <td><span class="access-badge user">[User / Public]</span></td>
                                <td>Initiates a new incremented payment attempt for an existing pending or failed payment.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/payments/:id</code></td>
                                <td><span class="access-badge user">[User / Public]</span></td>
                                <td>Get full payment details including discrete attempts, ledger transactions, and refunds.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/payments/webhook/:provider</code></td>
                                <td><span class="access-badge public">[Public / Webhook]</span></td>
                                <td>Asynchronous webhook ingestion. Validates cryptographic signatures, deduplicates events, and runs atomic database transaction (Payment + Order + Inventory Confirmation + Outbox Event).</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/payments/refund</code></td>
                                <td><span class="access-badge admin">[Admin: payment:refund]</span></td>
                                <td>Issues a full or partial refund for a successful payment, logs REFUND transaction, and updates order status.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/payments/reconcile</code></td>
                                <td><span class="access-badge admin">[Admin: payment:read]</span></td>
                                <td>Reconciles local payment status against external gateway to heal delayed or missed webhooks.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/payments/admin/list</code></td>
                                <td><span class="access-badge admin">[Admin: payment:read]</span></td>
                                <td>Lists all platform payments with status filters and pagination.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Transactional Outbox & Events -->
            <section id="outbox">
                <h2>⚡ Transactional Outbox & Event System</h2>
                <p class="section-desc">Reliable asynchronous event delivery architecture utilizing the Transactional Outbox Pattern, BullMQ background queues, pessimistic publisher locking, exponential backoff retries, dead-letter queue (DLQ) handling, and consumer idempotency.</p>

                <div class="diagram-box">
Database Transaction (API)
 ├── 1. Mutate Business Records (Orders, Payments, Inventory)
 └── 2. Insert OutboxEvent (Status: PENDING)
          │
          ▼
   Outbox Publisher (Background Cron / Sweep)
   Claims batch with publisher lock UUID & sets status to PROCESSING
          │
          ▼
   BullMQ Queue (Redis Stream)
          │
          ▼
   Worker Consumers (Idempotent execution via ProcessedEvent table)
   ├── Success ──► Mark OutboxEvent COMPLETED
   └── Failure ──► Exponential Backoff Retry (Max Attempts ──► FAILED / DLQ)
                </div>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/outbox/publish-now</code></td>
                                <td><span class="access-badge admin">[Admin: system:manage]</span></td>
                                <td>Manually triggers an immediate outbox sweep and publishes pending events to BullMQ.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/outbox/recover-stale</code></td>
                                <td><span class="access-badge admin">[Admin: system:manage]</span></td>
                                <td>Recovers stale events stuck in PROCESSING due to publisher crashes by unlocking them.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/outbox/events</code></td>
                                <td><span class="access-badge admin">[Admin: audit:read]</span></td>
                                <td>Lists all outbox events with status (PENDING, PROCESSING, PUBLISHED, FAILED), topic, and date filters.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/outbox/events/:id</code></td>
                                <td><span class="access-badge admin">[Admin: audit:read]</span></td>
                                <td>Retrieves detailed outbox event record including JSON payload, error logs, and retry attempts.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/outbox/events/:id/retry</code></td>
                                <td><span class="access-badge admin">[Admin: system:manage]</span></td>
                                <td>Forces an immediate manual retry for a failed or dead-lettered outbox event.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/outbox/processed</code></td>
                                <td><span class="access-badge admin">[Admin: audit:read]</span></td>
                                <td>Lists consumer idempotency logs from the ProcessedEvent ledger.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/outbox/metrics</code></td>
                                <td><span class="access-badge admin">[Admin: audit:read]</span></td>
                                <td>Aggregates real-time event pipeline health, queue sizes, failure counts, and retry throughput.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Notifications -->
            <section id="notifications">
                <h2>🔔 Notifications & Multi-Channel Dispatch</h2>
                <p class="section-desc">Event-driven multi-channel notifications (In-App, Email, Push) triggered asynchronously via Outbox consumers. Supports dynamic template rendering, customizable user preferences, unread badge counters, and background delivery retries.</p>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/notifications</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Lists user's in-app notifications with unread counter, channel filtering, and pagination.</td>
                            </tr>
                            <tr>
                                <td><span class="method patch">PATCH</span></td>
                                <td><code>/api/notifications/:id/read</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Marks a single notification as read.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/notifications/mark-all-read</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Marks all pending notifications as read in bulk for the current user.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/notifications/preferences</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Retrieves user's multi-channel notification preferences (Email, Push, In-App).</td>
                            </tr>
                            <tr>
                                <td><span class="method put">PUT</span></td>
                                <td><code>/api/notifications/preferences</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Updates notification preferences for order updates, promotional alerts, and stock changes.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/notifications/admin/send</code></td>
                                <td><span class="access-badge admin">[Admin: system:manage]</span></td>
                                <td>Allows administrators to manually dispatch system broadcasts or user notifications.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Coupons & Promotions -->
            <section id="coupons">
                <h2>🏷️ Coupons & Promotional Discounts</h2>
                <p class="section-desc">Enterprise promotional discounting engine supporting percentage discounts with maximum dollar caps, fixed monetary deductions, free shipping benefits, minimum order thresholds, date expiration, global usage limits, per-customer redemption limits, and immutable order usage tracking.</p>

                <div class="card-grid">
                    <div class="card">
                        <div class="card-icon">🏷️</div>
                        <h3>Flexible Discount Types</h3>
                        <p>Configure <code>PERCENTAGE</code> (with optional <code>maximumDiscountAmount</code> cap), <code>FIXED_AMOUNT</code>, or <code>FREE_SHIPPING</code> discounts.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">🛑</div>
                        <h3>Usage & Threshold Guardrails</h3>
                        <p>Enforce minimum order subtotals, global lifetime redemption caps, and per-user redemption limits to eliminate discount abuse.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">📊</div>
                        <h3>Promotional Analytics</h3>
                        <p>Track gross discount dollars distributed, total redemption volume, active promotion performance, and top redeemed coupons.</p>
                    </div>
                </div>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/coupons/validate</code></td>
                                <td><span class="access-badge public">[Public / User]</span></td>
                                <td>Customer preview: validates coupon code, checks rules & limits, and calculates exact discount amount and free shipping benefits for a subtotal.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/coupons/my-history</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Retrieves redemption history of all promotional coupons applied by the authenticated user across past orders.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/coupons</code></td>
                                <td><span class="access-badge admin">[Admin: coupon:read]</span></td>
                                <td>Lists promotional coupons with code search, discount type filter, status filter, and pagination.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/coupons/metrics</code></td>
                                <td><span class="access-badge admin">[Admin: coupon:read]</span></td>
                                <td>Retrieves promotion analytics: total coupons, active/inactive counts, total discount dollars granted, and top redeemed coupons.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/coupons/:id</code></td>
                                <td><span class="access-badge admin">[Admin: coupon:read]</span></td>
                                <td>Retrieves full configuration details and recent redemption statistics for a coupon.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/coupons</code></td>
                                <td><span class="access-badge admin">[Admin: coupon:create]</span></td>
                                <td>Creates a new coupon with discount strategy, minimum order threshold, maximum discount cap, and global/per-user limits.</td>
                            </tr>
                            <tr>
                                <td><span class="method put">PUT</span></td>
                                <td><code>/api/coupons/:id</code></td>
                                <td><span class="access-badge admin">[Admin: coupon:update]</span></td>
                                <td>Updates discount rules, limits, or validity dates for an existing coupon.</td>
                            </tr>
                            <tr>
                                <td><span class="method delete">DELETE</span></td>
                                <td><code>/api/coupons/:id</code></td>
                                <td><span class="access-badge admin">[Admin: coupon:delete]</span></td>
                                <td>Permanently deletes unused coupons or deactivates coupons with existing order usages to preserve financial audit integrity.</td>
                            </tr>
                            <tr>
                                <td><span class="method patch">PATCH</span></td>
                                <td><code>/api/coupons/:id/status</code></td>
                                <td><span class="access-badge admin">[Admin: coupon:update]</span></td>
                                <td>Quickly toggles coupon status between ACTIVE, INACTIVE, and EXPIRED.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/coupons/:id/usages</code></td>
                                <td><span class="access-badge admin">[Admin: coupon:read]</span></td>
                                <td>Lists all order redemption records and audit details for a specific coupon.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Reviews & Ratings -->
            <section id="reviews">
                <h2>⭐ Reviews, Ratings & Moderation</h2>
                <p class="section-desc">Authentic customer product feedback ecosystem featuring 1–5 star ratings, photo attachments, automatic Verified Purchase badge verification against completed orders, review moderation state machine (PENDING, APPROVED, REJECTED), bulk moderation, star rating breakdown analytics, and spam/abuse reporting with administrative resolution.</p>

                <div class="card-grid">
                    <div class="card">
                        <div class="card-icon">🛡️</div>
                        <h3>Verified Purchase Badge</h3>
                        <p>Reviews submitted by customers with paid/completed orders for that product automatically earn an authentic <code>isVerifiedPurchase: true</code> badge.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">⚖️</div>
                        <h3>Moderation State Machine</h3>
                        <p>New and edited reviews transition to <code>PENDING</code> until approved by moderators. Only <code>APPROVED</code> reviews appear in public storefront feeds.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">🚨</div>
                        <h3>Abuse & Spam Reporting</h3>
                        <p>Shoppers can flag fake reviews, spam, or harassment. Administrators can review reports and directly approve, reject, or delete offending reviews.</p>
                    </div>
                </div>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/reviews/products/:productId</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Public feed: lists approved reviews, customer photos, verified badges, pagination, and star distribution summary.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/reviews/products/:productId/summary</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Public product rating summary: average rating score, total review count, verified count, and 1 to 5 star distribution breakdown.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/reviews/:id</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Retrieves single review details by ID.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/reviews</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Submits a 1–5 star rating, optional title, text, and photo URLs. Automatically detects verified purchase status and enters moderation queue.</td>
                            </tr>
                            <tr>
                                <td><span class="method put">PUT</span></td>
                                <td><code>/api/reviews/:id</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Updates review content or rating. Automatically resets status to PENDING for moderation re-check.</td>
                            </tr>
                            <tr>
                                <td><span class="method delete">DELETE</span></td>
                                <td><code>/api/reviews/:id</code></td>
                                <td><span class="access-badge user">[User / Admin]</span></td>
                                <td>Deletes a review. Review authors can delete their own reviews; Admins can delete any review.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/reviews/my-reviews</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Retrieves all reviews submitted by the authenticated customer with approval statuses.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/reviews/:id/report</code></td>
                                <td><span class="access-badge user">[Authenticated User]</span></td>
                                <td>Flags a review for spam, harassment, fake content, or inappropriate behavior to alert administrators.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/reviews/admin/queue</code></td>
                                <td><span class="access-badge admin">[Admin: review:moderate]</span></td>
                                <td>Lists reviews currently waiting in the moderation queue (status: PENDING).</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/reviews/admin/all</code></td>
                                <td><span class="access-badge admin">[Admin: review:read]</span></td>
                                <td>Lists all platform reviews with full status filtering (PENDING, APPROVED, REJECTED), rating filters, and search.</td>
                            </tr>
                            <tr>
                                <td><span class="method patch">PATCH</span></td>
                                <td><code>/api/reviews/admin/:id/moderate</code></td>
                                <td><span class="access-badge admin">[Admin: review:moderate]</span></td>
                                <td>Moderates a single review to APPROVED or REJECTED with an admin audit note.</td>
                            </tr>
                            <tr>
                                <td><span class="method post">POST</span></td>
                                <td><code>/api/reviews/admin/bulk-moderate</code></td>
                                <td><span class="access-badge admin">[Admin: review:moderate]</span></td>
                                <td>Bulk approves or rejects multiple reviews simultaneously in a single transaction.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/reviews/admin/reports</code></td>
                                <td><span class="access-badge admin">[Admin: review:moderate]</span></td>
                                <td>Lists all user-submitted abuse/spam reports with status and reason filters.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/reviews/admin/reports/:id</code></td>
                                <td><span class="access-badge admin">[Admin: review:moderate]</span></td>
                                <td>Retrieves full abuse report details including reporter profile, flagged review, and author.</td>
                            </tr>
                            <tr>
                                <td><span class="method patch">PATCH</span></td>
                                <td><code>/api/reviews/admin/reports/:id/resolve</code></td>
                                <td><span class="access-badge admin">[Admin: review:moderate]</span></td>
                                <td>Resolves an abuse report and optionally approves, rejects, or permanently deletes the target review.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Search & Discovery -->
            <section id="search">
                <h2>🔍 Search & Discovery Engine</h2>
                <p class="section-desc">High-performance PostgreSQL-powered product discovery engine featuring multi-field text search, recursive category sub-tree resolution, brand & price range filtering, rating thresholds, stock availability toggles, multiple sorting algorithms, autocomplete suggestions, faceted aggregations, featured showcases, and contextual related products recommendations.</p>

                <div class="card-grid">
                    <div class="card">
                        <div class="card-icon">⚡</div>
                        <h3>PostgreSQL Indexed Search</h3>
                        <p>Multi-field text matching across product names, descriptions, SEO metadata, brand names, category names, and variant SKUs without premature external search engine overhead.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">📁</div>
                        <h3>Recursive Hierarchy</h3>
                        <p>Filtering by parent categories automatically searches all descendant subcategories across any arbitrary depth level.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">🎯</div>
                        <h3>Contextual Recommendations</h3>
                        <p>Recommends related items on product detail pages by matching common categories, brands, and name tokens while excluding the viewed product.</p>
                    </div>
                </div>

                <div class="table-wrap">
                    <table class="route-table">
                        <thead>
                            <tr>
                                <th>Method</th>
                                <th>Endpoint</th>
                                <th>Access Level</th>
                                <th>Purpose & Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/search</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Full product search with query, category (id/slug), brand (id/slug), min/max price, min rating, in-stock toggle, sorting (relevance, price_asc, price_desc, newest, rating_desc, popularity), and pagination.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/search/suggestions</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Instant autocomplete suggestions returning matching product names, brands with counts, and categories with counts.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/search/facets</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Returns contextual faceted aggregation data (available brands with counts, categories with counts, and dynamic price min/max range) for the active search criteria.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/discovery/featured</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Retrieves curated spotlight and featured products (<code>isFeatured: true</code>) with starting prices and rating summaries.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/discovery/related/:productId</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Recommends related products matching category, brand, and keywords, strictly excluding the specified product ID.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/discovery/trending</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Retrieves top-rated and highest-reviewed products across the platform.</td>
                            </tr>
                            <tr>
                                <td><span class="method get">GET</span></td>
                                <td><code>/api/discovery/new-arrivals</code></td>
                                <td><span class="access-badge public">[Public]</span></td>
                                <td>Retrieves the most recently added active products.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Module: Checkout Simulation -->
            <section id="simulation">
                <h2>🧪 Checkout & Payment Test Simulation</h2>
                <p class="section-desc">Dedicated testing endpoint allowing developers and QA to simulate full checkout and payment outcomes without third-party gateways.</p>

                <div class="callout">
                    <strong>Endpoint:</strong> <code>POST /api/inventory/checkout/simulate</code><br>
                    <strong>Access:</strong> <span class="access-badge user">[Authenticated User]</span>
                </div>

                <pre><code>// Request Payload
{
  "variantId": "09804e38-fc33-4f95-ba38-16cbaf9b4860",
  "quantity": 2,
  "simulatePaymentSuccess": true,
  "holdMinutes": 15
}

// Response Output (Success Flow)
{
  "success": true,
  "message": "Checkout simulation completed",
  "data": {
    "flowStatus": "ORDER_COMPLETED",
    "variantId": "09804e38-fc33-4f95-ba38-16cbaf9b4860",
    "quantity": 2,
    "timeline": [
      { "step": 1, "action": "STOCK_RESERVED", "status": "SUCCESS" },
      { "step": 2, "action": "SIMULATED_PAYMENT", "status": "SUCCESS" },
      { "step": 3, "action": "RESERVATION_CONFIRMED", "status": "COMPLETED" }
    ]
  }
}</code></pre>
            </section>
        </main>
    </div>

    <script>
        function filterRoutes() {
            const query = document.getElementById('routeSearch').value.toLowerCase();
            const rows = document.querySelectorAll('.route-table tbody tr');

            rows.forEach(row => {
                const text = row.innerText.toLowerCase();
                row.style.display = text.includes(query) ? '' : 'none';
            });
        }
    </script>
</body>
</html>
`;
