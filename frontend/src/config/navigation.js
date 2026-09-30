import {
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Building2,
  Calculator,
  CalendarRange,
  Car,
  ClipboardList,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Fuel,
  Gauge,
  HandCoins,
  History,
  IdCard,
  Landmark,
  LayoutDashboard,
  Link2,
  PiggyBank,
  Receipt,
  Route,
  Scale,
  Settings,
  ShieldCheck,
  TrendingUp,
  Truck,
  Upload,
  Users,
  Wallet,
} from 'lucide-react';

/**
 * Feature-based navigation (spec §45).
 *
 * `phase` marks the build phase that delivers each module; unbuilt modules render a
 * placeholder. Role-based visibility (`roles`) is added in Phase 2 — the backend
 * remains the authority for permissions, this only controls what is shown.
 */
export const NAV_SECTIONS = [
  {
    title: null,
    items: [{ label: 'Dashboard', path: '/', icon: LayoutDashboard, phase: 12 }],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Companies', path: '/companies', icon: Building2, phase: 3 },
      { label: 'Drivers', path: '/drivers', icon: IdCard, phase: 3 },
      { label: 'Vehicles', path: '/vehicles', icon: Truck, phase: 3 },
      { label: 'Assignments', path: '/assignments', icon: Link2, phase: 3 },
      { label: 'Trips', path: '/trips', icon: Route, phase: 5 },
      { label: 'Bulk Import', path: '/imports', icon: Upload, phase: 6 },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Company Settlements', path: '/company-settlements', icon: Landmark, phase: 4 },
      { label: 'Driver Earnings', path: '/earnings', icon: HandCoins, phase: 7 },
      { label: 'Driver Expenses', path: '/driver-expenses', icon: Receipt, phase: 8 },
      { label: 'Advances', path: '/advances', icon: Wallet, phase: 8 },
      { label: 'Driver Settlements', path: '/settlements', icon: Calculator, phase: 9 },
      { label: 'Driver Payments', path: '/payments', icon: Banknote, phase: 10 },
      { label: 'LV Expenses', path: '/lv-expenses', icon: Fuel, phase: 8 },
      { label: 'Reconciliation', path: '/reconciliation', icon: Scale, phase: 13 },
    ],
  },
  {
    title: 'Profit',
    items: [
      { label: 'Company Profit', path: '/profit/company', icon: PiggyBank, phase: 11 },
      { label: 'Monthly Profit', path: '/profit/monthly', icon: CalendarRange, phase: 11 },
      { label: 'Overall Profit', path: '/profit/overall', icon: TrendingUp, phase: 11 },
    ],
  },
  {
    title: 'Finance & Tax',
    items: [
      { label: 'Finance Dashboard', path: '/finance', icon: Gauge, phase: 12 },
      { label: 'GST', path: '/gst', icon: FileText, phase: 14 },
      { label: 'Tax Reports', path: '/tax-reports', icon: FileBarChart, phase: 14 },
      { label: 'Exports', path: '/exports', icon: FileSpreadsheet, phase: 14 },
    ],
  },
  {
    title: 'Reports',
    items: [
      { label: 'Driver Reports', path: '/reports/drivers', icon: Car, phase: 13 },
      { label: 'Trip Reports', path: '/reports/trips', icon: Route, phase: 13 },
      { label: 'Expense Reports', path: '/reports/expenses', icon: Receipt, phase: 13 },
      { label: 'Settlement Reports', path: '/reports/settlements', icon: ClipboardList, phase: 13 },
      { label: 'Payment Reports', path: '/reports/payments', icon: ArrowLeftRight, phase: 13 },
      { label: 'Profit Reports', path: '/reports/profit', icon: BarChart3, phase: 13 },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Users', path: '/users', icon: Users, phase: 2 },
      { label: 'Roles', path: '/roles', icon: ShieldCheck, phase: 2 },
      { label: 'Audit Logs', path: '/audit', icon: History, phase: 16 },
      { label: 'Settings', path: '/settings', icon: Settings, phase: 3 },
    ],
  },
];

/** Flat list of all nav items (used to generate placeholder routes). */
export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);
