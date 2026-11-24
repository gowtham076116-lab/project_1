import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Command,
  Compass,
  CreditCard,
  Database,
  FileClock,
  Filter,
  Gamepad2,
  Hexagon,
  Image,
  LayoutDashboard,
  LifeBuoy,
  ListFilter,
  LockKeyhole,
  LogOut,
  Map,
  Menu,
  MessageSquareWarning,
  MoreHorizontal,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Ticket,
  Trophy,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import type { LucideIcon } from "lucide-react";

const navGroups: { label: string; items: { label: string; path: string; icon: LucideIcon; badge?: string }[] }[] = [
  { label: "Overview", items: [{ label: "Dashboard", path: "/", icon: LayoutDashboard }] },
  {
    label: "People & Community",
    items: [
      { label: "Users", path: "/users", icon: Users },
      { label: "Running Analytics", path: "/running-analytics", icon: Activity },
      { label: "Communities", path: "/communities", icon: MessageSquareWarning },
      { label: "Moderation", path: "/moderation", icon: ShieldCheck, badge: "8" },
    ],
  },
  {
    label: "Activities",
    items: [
      { label: "Events", path: "/events", icon: CalendarDays },
      { label: "Event Hosting Studio", path: "/event-hosting", icon: ClipboardList },
      { label: "Ticketing & Bookings", path: "/bookings", icon: Ticket },
      { label: "Hive Calendar", path: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Health & Content",
    items: [
      { label: "Nutrition Studio", path: "/nutrition", icon: Compass },
      { label: "Recipes & Meal Plans", path: "/recipes", icon: ClipboardList },
    ],
  },
  {
    label: "Commerce",
    items: [
      { label: "Marketplace", path: "/marketplace", icon: ShoppingBag },
      { label: "Products", path: "/products", icon: Package },
      { label: "Orders", path: "/orders", icon: ClipboardList },
      { label: "Sponsors", path: "/sponsors", icon: Trophy },
      { label: "Revenue & Finance", path: "/revenue", icon: CreditCard },
    ],
  },
  { label: "Entertainment", items: [{ label: "HIVE PLAY", path: "/hive-play", icon: Gamepad2, badge: "LIVE" }] },
  {
    label: "Marketing",
    items: [
      { label: "Campaign Studio", path: "/campaigns", icon: Send },
      { label: "Notifications", path: "/notifications", icon: Bell },
      { label: "Media Library", path: "/media", icon: Image },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Support Centre", path: "/support", icon: LifeBuoy },
      { label: "Business Insights", path: "/insights", icon: BarChart3 },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Admin Users & Roles", path: "/admins", icon: LockKeyhole },
      { label: "Settings", path: "/settings", icon: Settings2 },
      { label: "Audit Logs", path: "/audit-logs", icon: FileClock },
    ],
  },
];

const pageMeta: Record<string, { eyebrow: string; title: string; description: string }> = {
  "/users": { eyebrow: "People / directory", title: "Users", description: "Understand who is moving through the Hive City ecosystem." },
  "/running-analytics": { eyebrow: "People / movement", title: "Running analytics", description: "Aggregated activity signals across privacy-safe regions." },
  "/communities": { eyebrow: "People / belonging", title: "Communities", description: "Track the groups giving the city its pulse." },
  "/moderation": { eyebrow: "People / trust", title: "Moderation", description: "Keep the community healthy with clear, auditable workflows." },
  "/events": { eyebrow: "Activities / calendar", title: "Events", description: "Coordinate the real-world moments that bring Hive City to life." },
  "/event-hosting": { eyebrow: "Activities / studio", title: "Event hosting studio", description: "Build and publish the next city experience." },
  "/bookings": { eyebrow: "Activities / attendance", title: "Ticketing & bookings", description: "Keep every ticket, booking and check-in accounted for." },
  "/calendar": { eyebrow: "Activities / planning", title: "Hive calendar", description: "One operational timeline for events, campaigns and content." },
  "/nutrition": { eyebrow: "Health / editorial", title: "Nutrition studio", description: "Publish food education that makes healthy movement easier." },
  "/recipes": { eyebrow: "Health / library", title: "Recipes & meal plans", description: "Shape the content library behind the nutrition experience." },
  "/marketplace": { eyebrow: "Commerce / storefront", title: "Marketplace", description: "A clean view into the products powering the community." },
  "/products": { eyebrow: "Commerce / catalogue", title: "Products", description: "Manage catalogue health, stock and sponsor visibility." },
  "/orders": { eyebrow: "Commerce / fulfilment", title: "Orders", description: "Keep fulfilment moving with an accountable order queue." },
  "/sponsors": { eyebrow: "Commerce / partners", title: "Sponsors", description: "See who is helping make every city run possible." },
  "/revenue": { eyebrow: "Commerce / finance", title: "Revenue & finance", description: "Trace the money behind tickets, orders and partnerships." },
  "/hive-play": { eyebrow: "Entertainment / live operations", title: "HIVE PLAY", description: "Monitor the city adventure network in real time." },
  "/campaigns": { eyebrow: "Marketing / orchestration", title: "Campaign studio", description: "Coordinate the message without losing the signal." },
  "/notifications": { eyebrow: "Marketing / delivery", title: "Notifications", description: "Review announcements, sends and delivery health." },
  "/media": { eyebrow: "Marketing / assets", title: "Media library", description: "Find the images that make each module feel like Hive City." },
  "/support": { eyebrow: "Operations / care", title: "Support centre", description: "Keep member questions moving to the right person." },
  "/insights": { eyebrow: "Operations / intelligence", title: "Business insights", description: "Turn platform signals into decisions the team can act on." },
  "/admins": { eyebrow: "Administration / access", title: "Admin users & roles", description: "Keep sensitive operations permissioned and accountable." },
  "/settings": { eyebrow: "Administration / control", title: "Settings", description: "Tune the operating environment for your team." },
  "/audit-logs": { eyebrow: "Administration / traceability", title: "Audit logs", description: "A durable trail of the changes that matter." },
};

const platformPulse = [
  { name: "Mon", users: 7100, sessions: 4200 },
  { name: "Tue", users: 8400, sessions: 5100 },
  { name: "Wed", users: 7800, sessions: 4680 },
  { name: "Thu", users: 9400, sessions: 6120 },
  { name: "Fri", users: 10300, sessions: 7310 },
  { name: "Sat", users: 11900, sessions: 8420 },
  { name: "Sun", users: 12840, sessions: 9040 },
];

const revenuePulse = [
  { name: "Mon", tickets: 34, market: 26 },
  { name: "Tue", tickets: 42, market: 31 },
  { name: "Wed", tickets: 38, market: 29 },
  { name: "Thu", tickets: 51, market: 40 },
  { name: "Fri", tickets: 57, market: 46 },
  { name: "Sat", tickets: 72, market: 61 },
  { name: "Sun", tickets: 68, market: 63 },
];

const users = [
  { name: "Aarav Menon", email: "aarav@hive.city", status: "Active", activity: "Running · 18 min ago", joined: "18 Nov 2026", accent: "cyan" },
  { name: "Mira Kapoor", email: "mira@hive.city", status: "Active", activity: "Event host · 42 min ago", joined: "17 Nov 2026", accent: "amber" },
  { name: "Kabir Shah", email: "kabir@hive.city", status: "Review", activity: "Community · 2 hr ago", joined: "16 Nov 2026", accent: "violet" },
  { name: "Sana Iyer", email: "sana@hive.city", status: "Active", activity: "Marketplace · 3 hr ago", joined: "15 Nov 2026", accent: "rose" },
  { name: "Neil Joseph", email: "neil@hive.city", status: "Paused", activity: "No recent activity", joined: "13 Nov 2026", accent: "blue" },
];
type PreviewUser = (typeof users)[number];

const events = [
  { name: "Midnight Cipher Hunt", type: "HIVE PLAY", date: "22 Nov · 21:00", bookings: "312 / 420", status: "Published", revenue: "₹1,44,600" },
  { name: "Sunrise Social Run", type: "RUNNING", date: "24 Nov · 06:30", bookings: "184 / 250", status: "Published", revenue: "₹42,400" },
  { name: "City Kitchen: Protein", type: "NUTRITION", date: "26 Nov · 17:30", bookings: "86 / 120", status: "Draft", revenue: "—" },
  { name: "The Greenway Relay", type: "COMMUNITY", date: "29 Nov · 07:00", bookings: "408 / 600", status: "Review", revenue: "₹1,02,000" },
];

const orders = [
  { id: "#ORD-4819", customer: "Tanya Verma", item: "Velocity Knit Runner", amount: "₹8,490", status: "Packed", time: "8 min ago" },
  { id: "#ORD-4818", customer: "Dev Patel", item: "Hydra Flask 750ml", amount: "₹1,250", status: "Paid", time: "26 min ago" },
  { id: "#ORD-4817", customer: "Riya Nair", item: "Night Run Shell", amount: "₹4,800", status: "Shipped", time: "1 hr ago" },
  { id: "#ORD-4816", customer: "Samir Khan", item: "Hive Recovery Pack", amount: "₹2,100", status: "Review", time: "2 hr ago" },
];

const activityFeed = [
  { icon: UserRound, title: "New member joined", detail: "Aarav Menon created an account", time: "18 min ago", tone: "cyan" },
  { icon: Ticket, title: "Booking confirmed", detail: "Midnight Cipher Hunt · #BK-2049", time: "42 min ago", tone: "amber" },
  { icon: Package, title: "Order packed", detail: "Velocity Knit Runner · #ORD-4819", time: "1 hr ago", tone: "violet" },
  { icon: MessageSquareWarning, title: "Report escalated", detail: "Community / Central Runners", time: "2 hr ago", tone: "rose" },
];

const heatmap = Array.from({ length: 84 }, (_, index) => ((index * 17 + 9) % 5));

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={false}>
        <TooltipProvider>
          <Toaster position="bottom-right" theme="light" richColors />
          <Portal />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function Portal() {
  const [location, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [userDrawer, setUserDrawer] = useState<(typeof users)[number] | null>(null);

  const activePath = location === "/" ? "/" : location;
  const meta = pageMeta[activePath];
  const activeLabel = activePath === "/" ? "Dashboard" : meta?.title || "Dashboard";
  const isDashboard = activePath === "/" || activePath === "/dashboard";
  const filteredUsers = useMemo(
    () => users.filter((user) => `${user.name} ${user.email} ${user.activity}`.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  function go(path: string) {
    navigate(path);
    setMobileNav(false);
    setSearch("");
  }

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar collapsed={collapsed} mobileOpen={mobileNav} activePath={activePath} onNavigate={go} onCollapse={() => setCollapsed((value) => !value)} />
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={18} /></button>
            <div className="breadcrumbs"><span>HIVE // OPS</span><ChevronRight size={13} /><strong>{activeLabel}</strong></div>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users, events, orders…" aria-label="Global search" />
              <kbd>⌘ K</kbd>
            </label>
            <div className="topbar-divider" />
            <div className="relative-wrap">
              <button className={`icon-button ${notificationsOpen ? "active" : ""}`} aria-label="Notifications" onClick={() => setNotificationsOpen((value) => !value)}><Bell size={17} /><span className="notification-dot" /></button>
              {notificationsOpen && <NotificationPopover onClose={() => setNotificationsOpen(false)} />}
            </div>
            <div className="relative-wrap">
              <button className="profile-chip" onClick={() => setProfileOpen((value) => !value)}><span className="avatar avatar-cyan">DZ</span><span className="profile-copy"><strong>Deekzhu Zu</strong><small>Super Admin</small></span><ChevronDown size={14} /></button>
              {profileOpen && <ProfilePopover onClose={() => setProfileOpen(false)} />}
            </div>
          </div>
        </header>
        <main className="content-area">
          {isDashboard ? (
            <Dashboard onQuickAction={() => setQuickActionOpen(true)} onNavigate={go} />
          ) : (
            <OperationalPage path={activePath} meta={meta || pageMeta["/users"]} search={search} users={filteredUsers} onUser={setUserDrawer} onQuickAction={() => setQuickActionOpen(true)} />
          )}
        </main>
      </div>
      {quickActionOpen && <QuickActionModal onClose={() => setQuickActionOpen(false)} onDone={(message) => { setQuickActionOpen(false); toast.success(message); }} />}
      {userDrawer && <UserDrawer user={userDrawer} onClose={() => setUserDrawer(null)} />}
    </div>
  );
}

function Sidebar({ collapsed, mobileOpen, activePath, onNavigate, onCollapse }: { collapsed: boolean; mobileOpen: boolean; activePath: string; onNavigate: (path: string) => void; onCollapse: () => void }) {
  return (
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-brand">
        <div className="brand-mark"><Hexagon size={22} strokeWidth={2.2} /><span /></div>
        {!collapsed && <div className="brand-wordmark"><strong>HIVE <span>//</span> OPS</strong><small>City operations layer</small></div>}
        <button className="icon-button sidebar-close-mobile" aria-label="Close navigation" onClick={() => onNavigate(activePath)}><X size={17} /></button>
      </div>
      <div className="status-strip"><span className="status-pulse" />{!collapsed && <><span>All systems nominal</span><small>v3.2</small></>}</div>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            {!collapsed && <div className="nav-label">{group.label}</div>}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = activePath === item.path || (activePath === "/dashboard" && item.path === "/");
              return <button key={item.path} className={`nav-item ${active ? "active" : ""}`} onClick={() => onNavigate(item.path)} title={collapsed ? item.label : undefined}>
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} /><span className="nav-item-text">{item.label}</span>{item.badge && !collapsed && <span className={`nav-badge ${item.badge === "LIVE" ? "live" : ""}`}>{item.badge}</span>}
              </button>;
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        {!collapsed && <div className="privacy-note"><LockKeyhole size={14} /><span>Privacy-safe telemetry<br /><strong>Region aggregated</strong></span></div>}
        <button className="collapse-button" onClick={onCollapse}><span>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</span>{!collapsed && "Collapse rail"}</button>
      </div>
    </aside>
  );
}

function Dashboard({ onQuickAction, onNavigate }: { onQuickAction: () => void; onNavigate: (path: string) => void }) {
  return (
    <div className="page-enter">
      <section className="page-heading dashboard-heading">
        <div><div className="eyebrow"><Radio size={13} /> Live overview <span className="eyebrow-separator" /> Thu, 19 Nov 2026</div><h1>Command centre</h1><p>Good morning, Deekzhu. Here’s the operating picture across Hive City.</p></div>
        <div className="heading-actions"><button className="secondary-button"><CalendarDays size={15} /> Last 7 days <ChevronDown size={14} /></button><button className="primary-button" onClick={onQuickAction}><Plus size={16} /> Quick action</button></div>
      </section>
      <div className="preview-banner"><Database size={15} /><span><strong>Preview telemetry</strong> — numbers shown here are local product data for interface review, not verified production statistics.</span><button onClick={() => toast("Backend data connectors are ready for the next build phase.")}>Learn more</button></div>
      <section className="command-feature-grid">
        <article className="feature-performance">
          <div className="feature-top"><span className="feature-kicker">PLATFORM PERFORMANCE</span><span className="feature-badge"><i /> Live collection window</span></div>
          <div className="feature-main"><div><p className="feature-label">Registered community</p><h2>12,840</h2><p className="feature-copy">People currently moving through the Hive City ecosystem.</p><div className="feature-statline"><strong>+12.8%</strong><span>vs. previous 7 days</span></div></div><div className="feature-visual" aria-hidden="true"><div className="feature-visual-label">USER GROWTH / 7D</div><div className="feature-bars">{[38,47,44,58,62,76,88].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><div className="feature-visual-foot"><span>Mon</span><span>Sun</span></div></div></div>
          <div className="feature-footer"><span><Users size={14} /> 8,432 active runners today</span><span><Activity size={14} /> 84,320 km logged this month</span><button onClick={() => onNavigate("/running-analytics")}>Open analytics</button></div>
        </article>
        <aside className="secondary-metrics">
          <div className="metric-intro"><span className="panel-eyebrow">SECONDARY METRICS</span><h2>Small signals, clear decisions.</h2></div>
          <div className="metric-item"><span className="metric-item-icon"><Users size={15} /></span><div><strong>1,284</strong><span>New users</span></div><em>+9.4%</em></div>
          <div className="metric-item"><span className="metric-item-icon terracotta"><Ticket size={15} /></span><div><strong>84.6%</strong><span>Event attendance</span></div><em>+3.1%</em></div>
          <div className="metric-item"><span className="metric-item-icon blush"><CreditCard size={15} /></span><div><strong>₹8,42,500</strong><span>Revenue this month</span></div><em>+18.2%</em></div>
          <div className="metric-item"><span className="metric-item-icon wine"><CalendarDays size={15} /></span><div><strong>3,420</strong><span>Tickets sold</span></div><em>+15.7%</em></div>
        </aside>
      </section>
      <section className="dashboard-grid main-chart-row">
        <div className="surface chart-panel pulse-panel"><PanelHeader eyebrow="PLATFORM PULSE" title="Growth over time" action={<button className="text-button" onClick={() => onNavigate("/insights")}>View insights</button>} /><div className="chart-legend"><span><i className="legend-dot cyan-dot" /> Active users</span><span><i className="legend-dot violet-dot" /> Running sessions</span><span className="chart-period"><button className="period-active">7D</button><button>30D</button><button>90D</button></span></div><div className="chart-wrap chart-wrap-large"><ResponsiveContainer width="100%" height="100%"><AreaChart data={platformPulse} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="userFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient><linearGradient id="sessionFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--violet)" stopOpacity={0.12} /><stop offset="100%" stopColor="var(--violet)" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-text)", fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-text)", fontSize: 11 }} tickFormatter={(value) => `${value / 1000}k`} /><ChartTooltip content={<ChartTooltipContent />} /><Area type="monotone" dataKey="users" stroke="var(--primary)" strokeWidth={2.5} fill="url(#userFill)" /><Area type="monotone" dataKey="sessions" stroke="var(--violet)" strokeWidth={2} fill="url(#sessionFill)" /></AreaChart></ResponsiveContainer></div><div className="chart-footnote"><span><strong>+18.4%</strong> growth comparison</span><span>Peak: <strong>12,840</strong> active users</span></div></div>
        <div className="surface chart-panel revenue-panel"><PanelHeader eyebrow="REVENUE PERFORMANCE" title="Two engines, one city" action={<button className="text-button" onClick={() => onNavigate("/revenue")}>Open report</button>} /><div className="revenue-total"><strong>₹8,42,500</strong><span className="positive">18.2%</span></div><div className="chart-wrap short"><ResponsiveContainer width="100%" height="100%"><BarChart data={revenuePulse} barGap={4} margin={{ top: 10, right: 0, left: -24, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-text)", fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-text)", fontSize: 10 }} tickFormatter={(value) => `${value}k`} /><ChartTooltip content={<ChartTooltipContent currency />} /><Bar dataKey="tickets" stackId="a" fill="var(--primary)" radius={[4, 4, 0, 0]} /><Bar dataKey="market" stackId="a" fill="var(--accent)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="revenue-keys"><span><i className="legend-dot cyan-dot" /> Tickets <strong>₹5,16,000</strong></span><span><i className="legend-dot amber-dot" /> Marketplace <strong>₹3,26,500</strong></span></div></div>
      </section>
      <section className="editorial-grid">
        <div className="surface editorial-panel"><PanelHeader eyebrow="UPCOMING EVENTS" title="What’s next in the city" action={<button className="text-button" onClick={() => onNavigate("/events")}>View all</button>} /><div className="event-list">{events.slice(0, 3).map((event) => <div className="event-row" key={event.name}><div className="event-date"><strong>{event.date.split(" ")[0]}</strong><span>{event.date.split(" ")[2]}</span></div><div><strong>{event.name}</strong><span>{event.type} · {event.bookings} booked</span></div><span className={`status-pill ${event.status.toLowerCase()}`}>{event.status}</span></div>)}</div></div>
        <div className="surface editorial-panel"><PanelHeader eyebrow="RECENT REGISTRATIONS" title="New energy" action={<button className="text-button" onClick={() => onNavigate("/users")}>View directory</button>} /><div className="registration-list">{users.slice(0, 4).map((user) => <div className="registration-row" key={user.email}><span className={`avatar avatar-${user.accent}`}>{user.name.split(" ").map((part) => part[0]).join("")}</span><div><strong>{user.name}</strong><span>{user.activity}</span></div><small>{user.joined.split(" ")[0]} Nov</small></div>)}</div></div>
        <div className="surface editorial-panel"><PanelHeader eyebrow="RECENT ORDERS" title="Commerce in motion" action={<button className="text-button" onClick={() => onNavigate("/orders")}>Manage orders</button>} /><div className="order-list">{orders.slice(0, 3).map((order) => <div className="order-row" key={order.id}><div><strong>{order.item}</strong><span>{order.id} · {order.customer}</span></div><div><strong>{order.amount}</strong><span className={`status-pill ${order.status.toLowerCase()}`}>{order.status}</span></div></div>)}</div></div>
      </section>
      <section className="dashboard-grid lower-grid">
        <div className="surface tactical-panel"><PanelHeader eyebrow="HIVE PLAY / LIVE OPS" title="Arenas need attention" action={<button className="text-button" onClick={() => onNavigate("/hive-play")}>Open operations</button>} /><div className="tactical-map"><div className="map-grid-lines" /><div className="map-label label-top">METROPOLIS SECTOR 07 <span>GPS SYNCED</span></div><div className="map-safe-zone"><span className="safe-label">VERIFIED SAFE ZONE</span></div><div className="map-route route-one" /><div className="map-route route-two" /><div className="map-cache cache-one">◆</div><div className="map-cache cache-two">◆</div><div className="agent-dot agent-a" /><div className="agent-dot agent-b" /><div className="agent-dot agent-c" /><div className="map-you"><span>YOU</span></div><div className="map-start">START POINT</div><div className="map-footer"><span>RADAR HUNT #4092</span><span>6 / 8 AGENTS ACTIVE</span><span>18:42</span></div></div><div className="arena-status-row"><div><span className="status-label">Active lobbies</span><strong>14</strong></div><div><span className="status-label">Agents in play</span><strong>1,842</strong></div><div><span className="status-label">Safe zone coverage</span><strong>100%</strong></div></div></div>
        <div className="surface activity-panel"><PanelHeader eyebrow="ACTIVITY STREAM" title="What just happened" action={<button className="secondary-button small-button" onClick={() => toast("Activity stream refreshed.")}><RefreshCw size={15} /> Refresh</button>} /><div className="activity-list">{activityFeed.map((item) => { const Icon = item.icon; return <div className="activity-item" key={item.title}><div className={`activity-icon ${item.tone}`}><Icon size={15} /></div><div className="activity-copy"><strong>{item.title}</strong><span>{item.detail}</span></div><time>{item.time}</time></div>; })}</div><button className="full-width-button" onClick={() => onNavigate("/audit-logs")}>View audit trail</button></div>
      </section>
      <section className="dashboard-grid bottom-grid"><div className="surface heat-panel"><PanelHeader eyebrow="MOVEMENT / REGIONS" title="A quiet heatmap tells the truth" action={<button className="text-button" onClick={() => onNavigate("/running-analytics")}>Explore regions</button>} /><div className="heatmap-wrap"><div className="heatmap-ylabels"><span>AM</span><span>NOON</span><span>PM</span><span>NIGHT</span></div><div className="heatmap"><div className="heatmap-week-labels"><span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>W5</span><span>W6</span><span>W7</span><span>W8</span><span>W9</span><span>W10</span><span>W11</span><span>W12</span></div><div className="heatmap-grid">{heatmap.map((level, index) => <span key={index} className={`heat-cell level-${level}`} title={`${level + 1} activity intensity`} />)}</div></div></div><div className="heatmap-caption"><span><i className="legend-dot cyan-dot" /> Higher movement volume</span><span>Aggregated by region · privacy-safe</span></div></div><div className="surface quick-panel"><PanelHeader eyebrow="DISPATCH" title="Quick actions" /><div className="quick-actions"><QuickAction icon={CalendarDays} label="Create event" tone="cyan" onClick={onQuickAction} /><QuickAction icon={Package} label="Add product" tone="amber" onClick={() => toast("Product flow opened — connect catalogue API to persist.")} /><QuickAction icon={ClipboardList} label="Publish recipe" tone="violet" onClick={() => toast("Recipe studio ready for content entry.")} /><QuickAction icon={Send} label="Send notification" tone="rose" onClick={() => toast("Notification composer opened.")} /></div><div className="dispatch-note"><Zap size={15} /><span><strong>Suggested next:</strong> review 8 moderation reports before the evening run window.</span><button className="secondary-button small-button" onClick={() => onNavigate("/moderation")}>Review queue</button></div></div></section>
    </div>
  );
}

function OperationalPage({ path, meta, search, users, onUser, onQuickAction }: { path: string; meta: { eyebrow: string; title: string; description: string }; search: string; users: PreviewUser[]; onUser: (user: PreviewUser) => void; onQuickAction: () => void }) {
  const [filter, setFilter] = useState("All");
  const isUsers = path === "/users";
  const isPlay = path === "/hive-play";
  const isAnalytics = path === "/running-analytics" || path === "/insights" || path === "/revenue";
  const isTable = ["/users", "/events", "/bookings", "/products", "/orders", "/support", "/moderation", "/audit-logs", "/admins"].includes(path);
  return <div className="page-enter"><section className="page-heading"><div><div className="eyebrow"><Command size={13} /> {meta.eyebrow}</div><h1>{meta.title}</h1><p>{meta.description}</p></div><div className="heading-actions"><button className="secondary-button"><CalendarDays size={15} /> 19 Nov 2026 <ChevronDown size={14} /></button><button className="primary-button" onClick={onQuickAction}><Plus size={16} /> Create new</button></div></section><div className="preview-banner compact"><Database size={15} /><span><strong>Preview module</strong> — this view is wired for real records once the domain API is connected.</span></div>{isPlay ? <PlayPage /> : isAnalytics ? <AnalyticsPage path={path} /> : isTable ? <TablePage path={path} filter={filter} setFilter={setFilter} users={users} search={search} onUser={onUser} /> : <ContentPage path={path} onQuickAction={onQuickAction} />}</div>;
}

function KpiCard({ label, value, change, trend, icon: Icon, accent, detail, spark }: { label: string; value: string; change: string; trend: "up" | "down"; icon: LucideIcon; accent: string; detail: string; spark: number[] }) {
  return <div className={`surface kpi-card accent-${accent}`}><div className="kpi-top"><span>{label}</span><span className={`kpi-icon ${accent}`}><Icon size={16} /></span></div><div className="kpi-value">{value}</div><div className="kpi-bottom"><span className={trend === "up" ? "positive" : "negative"}>{change}</span><span>{detail}</span></div><div className="sparkline" aria-hidden="true">{spark.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div>;
}

function PanelHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <div className="panel-header"><div><span className="panel-eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action}</div>;
}

function ChartTooltipContent({ active, payload, label, currency }: { active?: boolean; payload?: { dataKey?: string; value?: number }[]; label?: string; currency?: boolean }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><span>{label}</span>{payload.map((item) => <strong key={item.dataKey}>{currency ? `₹${item.value}k` : formatNumber(item.value || 0)}</strong>)}</div>;
}

function QuickAction({ icon: Icon, label, tone, onClick }: { icon: LucideIcon; label: string; tone: string; onClick: () => void }) { return <button className="quick-action" onClick={onClick}><span className={`quick-icon ${tone}`}><Icon size={16} /></span><span>{label}</span><ChevronRight size={14} /></button>; }

function NotificationPopover({ onClose }: { onClose: () => void }) { return <div className="popover notification-popover"><div className="popover-head"><strong>Notifications</strong><button className="icon-button small" onClick={onClose}><X size={14} /></button></div><div className="notification-item"><span className="notification-bar cyan" /><div><strong>Evening run window opens soon</strong><p>12 events are within their registration window.</p><small>12 min ago</small></div></div><div className="notification-item"><span className="notification-bar rose" /><div><strong>8 reports need review</strong><p>Community / Central Runners is trending.</p><small>2 hr ago</small></div></div><button className="popover-link" onClick={onClose}>Open notification centre </button></div>; }
function ProfilePopover({ onClose }: { onClose: () => void }) { return <div className="popover profile-popover"><div className="profile-popover-head"><span className="avatar avatar-cyan">DZ</span><div><strong>Deekzhu Zu</strong><span>Super Admin</span></div></div><button onClick={() => { onClose(); toast("Profile settings are ready for backend wiring."); }}><Settings2 size={15} /> Profile settings</button><button onClick={() => { onClose(); toast("Security centre opened."); }}><ShieldCheck size={15} /> Security centre</button><div className="popover-divider" /><button className="danger-link" onClick={() => { onClose(); toast("Logout is handled by the existing auth route."); }}><LogOut size={15} /> Sign out</button></div>; }

function QuickActionModal({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) { const [name, setName] = useState(""); return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="panel-eyebrow">DISPATCH / NEW RECORD</span><h2>Start a new workflow</h2></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="modal-tabs"><button className="modal-tab active">Event</button><button className="modal-tab">Product</button><button className="modal-tab">Recipe</button><button className="modal-tab">Notification</button></div><label className="field-label">Event name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Riverside Night Run" /></label><div className="form-grid"><label className="field-label">Category<select defaultValue="Running"><option>Running</option><option>HIVE PLAY</option><option>Nutrition</option><option>Community</option></select></label><label className="field-label">Visibility<select defaultValue="Draft"><option>Draft</option><option>Internal review</option><option>Published</option></select></label></div><div className="modal-note"><ClipboardList size={15} /><span>Preview mode: this saves only to the current interface session until the Events API is connected.</span></div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => onDone(name ? `Draft created for ${name}.` : "Draft created.")}><Check size={16} /> Save draft</button></div></div></div>; }

function UserDrawer({ user, onClose }: { user: (typeof users)[number]; onClose: () => void }) { return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="user-drawer" onMouseDown={(event) => event.stopPropagation()}><div className="drawer-head"><div><span className="panel-eyebrow">USER 360° / PREVIEW</span><h2>Member profile</h2></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="drawer-profile"><span className={`avatar avatar-${user.accent}`}>{user.name.split(" ").map((part) => part[0]).join("")}</span><div><h3>{user.name}</h3><p>{user.email}</p><span className={`status-pill ${user.status.toLowerCase()}`}>{user.status}</span></div></div><div className="drawer-stats"><div><strong>48</strong><span>Sessions</span></div><div><strong>312 km</strong><span>Distance</span></div><div><strong>70.8%</strong><span>Attendance</span></div></div><div className="drawer-section"><span className="panel-eyebrow">RECENT SIGNAL</span><div className="drawer-signal"><Activity size={16} /><div><strong>{user.activity}</strong><span>Last active event recorded in preview telemetry.</span></div></div></div><div className="drawer-section"><span className="panel-eyebrow">ACCOUNT CONTROLS</span><button className="drawer-action"><ShieldCheck size={15} /> Review permissions <ChevronRight size={14} /></button><button className="drawer-action"><MessageSquareWarning size={15} /> Add internal note <ChevronRight size={14} /></button><button className="drawer-action danger"><Archive size={15} /> Suspend account <ChevronRight size={14} /></button></div><div className="drawer-footer"><LockKeyhole size={14} /> Personal and health data is permission-gated.</div></aside></div>; }

function TablePage({ path, filter, setFilter, users, search, onUser }: { path: string; filter: string; setFilter: (value: string) => void; users: PreviewUser[]; search: string; onUser: (user: PreviewUser) => void }) {
  const userMode = path === "/users";
  const eventMode = path === "/events";
  const orderMode = path === "/orders" || path === "/products";
  const moderationMode = path === "/moderation";
  const supportMode = path === "/support";
  const rows = userMode ? users : eventMode ? events : orderMode ? orders : users.map((user, index) => ({ name: moderationMode ? ["Central Runners", "Night Shift Crew", "Sunrise Social"][index % 3] : supportMode ? ["Ticket #SUP-2084", "Ticket #SUP-2081", "Ticket #SUP-2077"][index % 3] : `Record #${4801 + index}`, email: moderationMode ? "3 reports · context attached" : supportMode ? ["Payment confirmation", "Account access", "Event refund"][index % 3] : user.email, status: moderationMode ? ["Pending", "Under review", "Resolved"][index % 3] : supportMode ? ["Open", "In Progress", "Waiting"][index % 3] : user.status, activity: user.activity, joined: user.joined }));
  const filtered = rows.filter((row: any) => `${row.name} ${row.email} ${row.status} ${row.item || ""}`.toLowerCase().includes(search.toLowerCase())).filter((row: any) => filter === "All" || row.status === filter);
  const filterOptions = userMode ? ["All", "Active", "Review", "Paused"] : eventMode ? ["All", "Published", "Draft", "Review"] : orderMode ? ["All", "Paid", "Packed", "Shipped", "Review"] : moderationMode ? ["All", "Pending", "Under review", "Resolved"] : supportMode ? ["All", "Open", "In Progress", "Waiting"] : ["All", "Active", "Review", "Paused"];
  return <div className="surface table-surface"><div className="table-toolbar"><div className="toolbar-copy"><span className="result-count">{filtered.length} records</span><span className="toolbar-muted">Updated a few moments ago</span></div><div className="toolbar-actions"><div className="select-wrap"><Filter size={14} /><select value={filter} onChange={(event) => setFilter(event.target.value)}>{filterOptions.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={13} /></div><button className="secondary-button small-button"><ListFilter size={14} /> More filters</button><button className="icon-button small"><MoreHorizontal size={16} /></button></div></div><div className="table-wrap"><table><thead><tr><th>{userMode ? "Member" : eventMode ? "Event" : orderMode ? "Record" : "Queue"}</th><th>{userMode ? "Status" : eventMode ? "Schedule" : orderMode ? "Customer / detail" : "Context"}</th><th>{userMode ? "Last signal" : eventMode ? "Bookings" : orderMode ? "Amount" : "Status"}</th><th>{userMode ? "Joined" : eventMode ? "Revenue" : orderMode ? "Status" : "Last updated"}</th><th /></tr></thead><tbody>{filtered.map((row: any, index) => <tr key={`${row.name}-${index}`} onClick={() => userMode && onUser(row)}><td><div className="table-primary">{userMode && <span className={`avatar avatar-${row.accent}`}>{row.name.split(" ").map((part: string) => part[0]).join("")}</span>}<div><strong>{row.name}</strong>{row.id && <span>{row.id}</span>}{row.email && <span>{row.email}</span>}{row.item && <span>{row.item}</span>}</div></div></td><td>{eventMode ? <span className="table-muted">{row.date}</span> : userMode ? <span className={`status-pill ${String(row.status).toLowerCase().replaceAll(" ", "-")}`}>{row.status}</span> : <span className="table-muted">{row.email}</span>}</td><td>{eventMode ? row.bookings : userMode ? row.activity : orderMode ? row.amount : <span className={`status-pill ${String(row.status).toLowerCase().replaceAll(" ", "-")}`}>{row.status}</span>}</td><td>{eventMode ? <span className={`status-pill ${row.status.toLowerCase()}`}>{row.status}</span> : userMode ? row.joined : orderMode ? <span className={`status-pill ${String(row.status).toLowerCase()}`}>{row.status}</span> : row.activity}</td><td><button className="icon-button small"><MoreHorizontal size={16} /></button></td></tr>)}</tbody></table></div><div className="table-footer"><span>Showing {filtered.length} of {rows.length} preview records</span><div className="pagination"><button className="icon-button small"><ChevronLeft size={15} /></button><span>1</span><button className="icon-button small"><ChevronRight size={15} /></button></div></div></div>;
}

function AnalyticsPage({ path }: { path: string }) { const revenue = path === "/revenue"; const insight = path === "/insights"; return <><section className="metric-strip"><div className="surface mini-metric"><span>{revenue ? "Gross revenue" : insight ? "Monthly active" : "Distance logged"}</span><strong>{revenue ? "₹8,42,500" : insight ? "42,180" : "84,320 km"}</strong><span className="positive"> 18.2% vs prior</span></div><div className="surface mini-metric"><span>{revenue ? "Avg. order value" : insight ? "Retention" : "Sessions"}</span><strong>{revenue ? "₹1,250" : insight ? "62.4%" : "18,402"}</strong><span className="positive"> 8.4% vs prior</span></div><div className="surface mini-metric"><span>{revenue ? "Refunds" : insight ? "Event conversion" : "Avg. pace"}</span><strong>{revenue ? "₹18,240" : insight ? "14.8%" : "6:24 / km"}</strong><span className="negative"> 3.1% vs prior</span></div></section><div className="analytics-grid"><div className="surface chart-panel analytics-chart"><PanelHeader eyebrow={revenue ? "FINANCE / 30 DAYS" : insight ? "BUSINESS / 30 DAYS" : "RUNNING / 30 DAYS"} title={revenue ? "Revenue performance" : insight ? "Platform momentum" : "Movement volume"} action={<button className="secondary-button small-button"><CalendarDays size={14} /> 30D</button>} /><div className="chart-wrap tall"><ResponsiveContainer width="100%" height="100%"><AreaChart data={platformPulse.concat([{ name: "Next", users: 14100, sessions: 10100 }])} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="analyticsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-text)", fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-text)", fontSize: 11 }} /><ChartTooltip content={<ChartTooltipContent />} /><Area dataKey="users" type="monotone" stroke="var(--primary)" strokeWidth={2.5} fill="url(#analyticsFill)" /></AreaChart></ResponsiveContainer></div></div><div className="surface insight-card"><PanelHeader eyebrow="SIGNALS / AI-READY" title="What deserves attention" /><div className="insight-list"><InsightItem icon={Zap} title="Saturday is the strongest movement window" body="Sessions are 22% higher after 18:00. Consider a timed community challenge." tone="cyan" /><InsightItem icon={Ticket} title="Ticket revenue is outperforming marketplace" body="Tickets contribute 61% of preview revenue this period." tone="amber" /><InsightItem icon={ShieldCheck} title="Trust signals are stable" body="Reports resolved within a day are up 6.2% across active communities." tone="violet" /></div><div className="ai-disclaimer"><CircleHelp size={14} /> Insights shown are recommendations based on preview telemetry, not verified business facts.</div></div></div><div className="surface region-table"><PanelHeader eyebrow="REGIONAL PULSE" title="Where activity is concentrating" action={<button className="text-button">Open map <Map size={14} /></button>} /><div className="region-row"><span className="region-rank">01</span><div className="region-name"><strong>Central Metropolis</strong><span>38 active communities</span></div><div className="region-bar"><i style={{ width: "88%" }} /></div><strong>88%</strong></div><div className="region-row"><span className="region-rank">02</span><div className="region-name"><strong>Riverside Greenway</strong><span>24 active communities</span></div><div className="region-bar"><i style={{ width: "64%" }} /></div><strong>64%</strong></div><div className="region-row"><span className="region-rank">03</span><div className="region-name"><strong>North Loop</strong><span>17 active communities</span></div><div className="region-bar"><i style={{ width: "42%" }} /></div><strong>42%</strong></div></div></>; }
function InsightItem({ icon: Icon, title, body, tone }: { icon: LucideIcon; title: string; body: string; tone: string }) { return <div className="insight-item"><span className={`insight-icon ${tone}`}><Icon size={15} /></span><div><strong>{title}</strong><p>{body}</p></div></div>; }

function PlayPage() { return <><div className="play-overview"><div className="surface play-hero"><div className="play-hero-copy"><div className="eyebrow"><Radio size={13} /> Live GPS multiplayer platform</div><h2>The city is still your playground.</h2><p>Monitor safe zones, active squads and match health from one tactical view.</p><div className="play-actions"><button className="primary-button"><Plus size={16} /> Create arena</button><button className="secondary-button"><Map size={15} /> Open live map</button></div></div><div className="play-hero-stat"><span>ACTIVE AGENTS</span><strong>1,842</strong><small><i className="status-pulse" /> 14 live arenas</small></div></div><div className="surface play-kpi"><span>SAFE ZONE COVERAGE</span><strong>100%</strong><p>Verified public areas only.</p><div className="safe-progress"><i /></div></div></div><div className="play-grid"><div className="surface tactical-panel large"><PanelHeader eyebrow="TACTICAL GEO-ENGINE" title="Live arena map" action={<div className="map-tabs"><button className="active">All layers</button><button>Checkpoints</button><button>Agents</button></div>} /><div className="tactical-map play-map"><div className="map-grid-lines" /><div className="map-label label-top">CENTRAL METROPOLIS <span>GPS SYNCED</span></div><div className="map-safe-zone wide"><span className="safe-label">ACTIVE SAFE ZONE / NO ROADS</span></div><div className="map-route route-one" /><div className="map-route route-two" /><div className="map-cache cache-one">◆</div><div className="map-cache cache-two">◆</div><div className="map-cache cache-three">◆</div>{["agent-a", "agent-b", "agent-c", "agent-d", "agent-e"].map((agent) => <div className={`agent-dot ${agent}`} key={agent} />)}<div className="map-you"><span>YOU / SEEKER</span></div><div className="map-start">START POINT</div><div className="map-footer"><span>RADAR HUNT #4092</span><span>SECTOR 07</span><span>18:42</span></div></div></div><div className="surface mode-panel"><PanelHeader eyebrow="GAME CATALOGUE" title="Five play archetypes" action={<button className="text-button">Manage modes </button>} /><div className="mode-list"><ModeRow number="01" name="Hide and Seek" meta="2–16 players · Stealth" active /><ModeRow number="02" name="Radar Hunt" meta="2–10 players · Popular" /><ModeRow number="03" name="Treasure Hunt" meta="1–20 players · Exploration" /><ModeRow number="04" name="Team Chase" meta="4–24 players · Competitive" /><ModeRow number="05" name="Hive Missions" meta="Daily rotation · Quest board" /></div></div></div><div className="surface match-table"><PanelHeader eyebrow="WAR ROOM / ACTIVE LOBBIES" title="Squads in motion" action={<button className="secondary-button small-button"><RefreshCw size={14} /> Refresh</button>} /><div className="match-row match-header"><span>Match</span><span>Mode</span><span>Agents</span><span>Status</span><span /></div>{[["#4092", "Radar Hunt", "6 / 8", "In progress"], ["#4088", "Team Chase", "18 / 24", "Ready check"], ["#4084", "Treasure Hunt", "4 / 12", "In progress"]].map((match) => <div className="match-row" key={match[0]}><strong>{match[0]}</strong><span>{match[1]}</span><span>{match[2]}</span><span className={`status-pill ${match[3] === "In progress" ? "active" : "review"}`}>{match[3]}</span><button className="icon-button small"><MoreHorizontal size={16} /></button></div>)}</div></>; }
function ModeRow({ number, name, meta, active }: { number: string; name: string; meta: string; active?: boolean }) { return <div className={`mode-row ${active ? "active" : ""}`}><span className="mode-number">{number}</span><div><strong>{name}</strong><span>{meta}</span></div>{active && <span className="live-tag">ACTIVE</span>}<ChevronRight size={15} /></div>; }

function ContentPage({ path, onQuickAction }: { path: string; onQuickAction: () => void }) { const contentMap: Record<string, { cards: { title: string; meta: string; status: string; icon: LucideIcon }[]; note: string }> = { "/nutrition": { note: "Editorial workspace for recipes, hydration and food education.", cards: [{ title: "Citrus recovery bowl", meta: "Recipe · 8 min read", status: "Published", icon: Compass }, { title: "Hydration after dark", meta: "Guide · 4 min read", status: "Review", icon: ClipboardList }, { title: "Meal prep for event week", meta: "Collection · 6 recipes", status: "Draft", icon: ClipboardList }] }, "/recipes": { note: "A calmer library view for building meal plans with context.", cards: [{ title: "Post-run proteins", meta: "8 recipes · 3 tags", status: "Published", icon: ClipboardList }, { title: "The city kitchen", meta: "12 recipes · 5 tags", status: "Published", icon: Compass }, { title: "Night-shift meals", meta: "4 recipes · 2 tags", status: "Draft", icon: Archive }] }, "/campaigns": { note: "Message planning and campaign staging, ready for delivery integration.", cards: [{ title: "Saturday arena reminder", meta: "Audience · 2,480", status: "Scheduled", icon: Send }, { title: "Welcome to the hive", meta: "Audience · New members", status: "Live", icon: ClipboardList }, { title: "Winter recovery week", meta: "Audience · Runners", status: "Draft", icon: Compass }] }, "/notifications": { note: "Every send should be traceable to an underlying provider receipt.", cards: [{ title: "Arena opens in 60 minutes", meta: "Push · Delivered 97%", status: "Sent", icon: Bell }, { title: "Your run is waiting", meta: "Push · Draft audience", status: "Draft", icon: Send }, { title: "New recipe drop", meta: "In-app · 3,820 reached", status: "Sent", icon: ClipboardList }] }, "/media": { note: "Central asset index for event covers, product images and community stories.", cards: [{ title: "Midnight Cipher cover", meta: "Event cover · 2.4 MB", status: "In use", icon: Image }, { title: "Velocity Knit Runner", meta: "Product image · 1.2 MB", status: "In use", icon: ShoppingBag }, { title: "Sunrise Social set", meta: "Community · 8 assets", status: "Review", icon: Image }] }, "/calendar": { note: "A single planning surface for moments that matter.", cards: [{ title: "Sunrise Social Run", meta: "24 Nov · 06:30", status: "Event", icon: CalendarDays }, { title: "Winter recovery campaign", meta: "26 Nov · 09:00", status: "Campaign", icon: Send }, { title: "Citrus recovery bowl", meta: "27 Nov · 12:00", status: "Content", icon: Compass }] }, "/sponsors": { note: "Partner visibility and contribution tracking without losing the human detail.", cards: [{ title: "Velocity Labs", meta: "Running technology · Tier 1", status: "Active", icon: Trophy }, { title: "Northline Coffee", meta: "Hospitality · Tier 2", status: "Active", icon: ClipboardList }, { title: "Urban Form", meta: "Apparel · Prospect", status: "Review", icon: ShoppingBag }] }, "/admins": { note: "Permission-ready role management for the people operating the platform.", cards: [{ title: "Super Admin", meta: "1 member · Full access", status: "Protected", icon: LockKeyhole }, { title: "Event Manager", meta: "3 members · Events + tickets", status: "Active", icon: CalendarDays }, { title: "Community Manager", meta: "2 members · Groups + reports", status: "Active", icon: Users }] }, "/settings": { note: "Platform configuration is intentionally separated from secrets and payment credentials.", cards: [{ title: "Platform preferences", meta: "Timezone · INR · 24h", status: "Configured", icon: Settings2 }, { title: "Notification settings", meta: "Push + in-app", status: "Configured", icon: Bell }, { title: "Security settings", meta: "Sessions · MFA", status: "Review", icon: ShieldCheck }] }, "/audit-logs": { note: "A searchable trail of important administrative actions.", cards: [{ title: "Admin role updated", meta: "By Deekzhu Zu · 09:42", status: "Recorded", icon: FileClock }, { title: "Event draft created", meta: "By Mira Kapoor · 08:31", status: "Recorded", icon: CalendarDays }, { title: "Report escalated", meta: "By Deekzhu Zu · 07:56", status: "Recorded", icon: ShieldCheck }] }, "/marketplace": { note: "Commerce is separated into catalogue, fulfilment and finance so nothing gets lost.", cards: [{ title: "Velocity Knit Runner", meta: "Running shoes · 42 in stock", status: "Healthy", icon: ShoppingBag }, { title: "Hive Recovery Pack", meta: "Supplements · 8 in stock", status: "Low stock", icon: Package }, { title: "Night Run Shell", meta: "Sportswear · 24 in stock", status: "Healthy", icon: ShoppingBag }] }, "/event-hosting": { note: "A six-step publishing workflow keeps details, safety and ticketing aligned.", cards: [{ title: "1. Event details", meta: "Name, category, cover", status: "Ready", icon: ClipboardList }, { title: "2. Location & safety", meta: "Venue, map, boundary", status: "Ready", icon: Map }, { title: "3. Schedule & tickets", meta: "Time, capacity, price", status: "Next", icon: Ticket }] } }; const cards = contentMap[path]?.cards || [{ title: "Operational overview", meta: "Module data will appear here", status: "Preview", icon: Database }, { title: "Data connection", meta: "Protected API seam available", status: "Ready", icon: ShieldCheck }, { title: "Next action", meta: "Create your first record", status: "Open", icon: Plus }]; return <div className="content-page"><div className="surface module-intro"><div><span className="panel-eyebrow">WORKSPACE / PREVIEW</span><h2>{contentMap[path]?.note || "A focused operational workspace for the Hive City team."}</h2></div><button className="primary-button" onClick={onQuickAction}><Plus size={16} /> Start workflow</button></div><div className="content-card-grid">{cards.map(({ title, meta, status, icon: Icon }) => <div className="surface content-card" key={title}><div className="content-card-top"><span className="content-icon"><Icon size={17} /></span><span className={`status-pill ${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></div><h3>{title}</h3><p>{meta}</p><button className="text-button">Open workspace </button></div>)}</div><div className="surface empty-state"><div className="empty-orbit"><Hexagon size={24} /></div><div><span className="panel-eyebrow">BACKEND CONNECTION PENDING</span><h3>Ready for real records when the module API lands.</h3><p>This module is intentionally showing a clear preview state instead of inventing production data.</p></div><button className="secondary-button" onClick={() => toast("Integration notes copied to the implementation backlog.")}>View integration note</button></div></div>; }

export default App;
