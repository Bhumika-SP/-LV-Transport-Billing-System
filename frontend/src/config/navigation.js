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
  Tags,
  TrendingUp,
  Truck,
  Upload,
  Users,
  Wallet,
} from 'lucide-react';
import { PERMISSIONS as P, ROLES } from './permissions';

const ALL = [ROLES.ADMIN, ROLES.BILLER, ROLES.AUDITOR];
/** Profit, tax and reconciliation: Admin/Manager and Auditor/Finance (spec §7, §9). */
const FINANCE = [ROLES.ADMIN, ROLES.AUDITOR];

/**
 * Feature-based navigation (spec §45).
 *
 * `phase` marks the build phase that delivers each module; unbuilt modules render a
 * placeholder. Visibility: `permission` (built modules, mirrors the backend) or
 * `roles` (modules not yet built, from spec §7–9). This only controls what is shown;
 * the backend enforces every permission independently.
 */
export const NAV_SECTIONS = [
  {
    title: null,
    items: [{ label: 'Dashboard', path: '/', icon: LayoutDashboard, phase: 12 }],
  },
  {
    title: 'Operations',
    items: [
      {
        label: 'Companies',
        path: '/companies',
        icon: Building2,
        phase: 3,
        permission: P.MASTER_VIEW,
      },
      { label: 'Drivers', path: '/drivers', icon: IdCard, phase: 3, permission: P.MASTER_VIEW },
      { label: 'Vehicles', path: '/vehicles', icon: Truck, phase: 3, permission: P.MASTER_VIEW },
      {
        label: 'Vehicle Types',
        path: '/vehicle-types',
        icon: Tags,
        phase: 3,
        permission: P.MASTER_VIEW,
      },
      {
        label: 'Assignments',
        path: '/assignments',
        icon: Link2,
        phase: 3,
        permission: P.MASTER_VIEW,
      },
      { label: 'Trips', path: '/trips', icon: Route, phase: 5, permission: P.TRIP_VIEW },
      { label: 'Bulk Import', path: '/imports', icon: Upload, phase: 6, permission: P.IMPORT_VIEW },
    ],
  },
  {
    title: 'Finance',
    items: [
      {
        label: 'Company Settlements',
        path: '/company-settlements',
        icon: Landmark,
        phase: 4,
        permission: P.COMPANY_SETTLEMENT_VIEW,
      },
      {
        label: 'Driver Earnings',
        path: '/earnings',
        icon: HandCoins,
        phase: 7,
        permission: P.DRIVER_FINANCE_VIEW,
      },
      {
        label: 'Driver Expenses',
        path: '/driver-expenses',
        icon: Receipt,
        phase: 8,
        permission: P.DRIVER_FINANCE_VIEW,
      },
      {
        label: 'Advances',
        path: '/advances',
        icon: Wallet,
        phase: 8,
        permission: P.DRIVER_FINANCE_VIEW,
      },
      {
        label: 'Driver Settlements',
        path: '/settlements',
        icon: Calculator,
        phase: 9,
        permission: P.SETTLEMENT_VIEW,
      },
      {
        label: 'Driver Payments',
        path: '/payments',
        icon: Banknote,
        phase: 10,
        permission: P.PAYMENT_VIEW,
      },
      {
        label: 'LV Expenses',
        path: '/lv-expenses',
        icon: Fuel,
        phase: 8,
        permission: P.DRIVER_FINANCE_VIEW,
      },
      {
        label: 'Reconciliation',
        path: '/reconciliation',
        icon: Scale,
        phase: 13,
        permission: P.PROFIT_VIEW,
      },
    ],
  },
  {
    title: 'Profit',
    items: [
      {
        label: 'Company Profit',
        path: '/profit/company',
        icon: PiggyBank,
        phase: 11,
        permission: P.PROFIT_VIEW,
      },
      {
        label: 'Monthly Profit',
        path: '/profit/monthly',
        icon: CalendarRange,
        phase: 11,
        permission: P.PROFIT_VIEW,
      },
      {
        label: 'Overall Profit',
        path: '/profit/overall',
        icon: TrendingUp,
        phase: 11,
        permission: P.PROFIT_VIEW,
      },
    ],
  },
  {
    title: 'Finance & Tax',
    items: [
      {
        label: 'Finance Dashboard',
        path: '/finance',
        icon: Gauge,
        phase: 12,
        permission: P.PROFIT_VIEW,
      },
      { label: 'GST', path: '/gst', icon: FileText, phase: 14, roles: FINANCE },
      { label: 'Tax Reports', path: '/tax-reports', icon: FileBarChart, phase: 14, roles: FINANCE },
      { label: 'Exports', path: '/exports', icon: FileSpreadsheet, phase: 13, roles: ALL },
    ],
  },
  {
    title: 'Reports',
    items: [
      { label: 'Driver Reports', path: '/reports/drivers', icon: Car, phase: 13, roles: ALL },
      { label: 'Trip Reports', path: '/reports/trips', icon: Route, phase: 13, roles: ALL },
      { label: 'Expense Reports', path: '/reports/expenses', icon: Receipt, phase: 13, roles: ALL },
      {
        label: 'Settlement Reports',
        path: '/reports/settlements',
        icon: ClipboardList,
        phase: 13,
        roles: ALL,
      },
      {
        label: 'Payment Reports',
        path: '/reports/payments',
        icon: ArrowLeftRight,
        phase: 13,
        roles: ALL,
      },
      {
        label: 'Profit Reports',
        path: '/reports/profit',
        icon: BarChart3,
        phase: 13,
        permission: P.PROFIT_VIEW,
      },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Users', path: '/users', icon: Users, phase: 2, permission: P.USER_MANAGE },
      { label: 'Roles', path: '/roles', icon: ShieldCheck, phase: 2, permission: P.ROLE_VIEW },
      { label: 'Audit Logs', path: '/audit', icon: History, phase: 16, permission: P.AUDIT_VIEW },
      {
        label: 'Settings',
        path: '/settings',
        icon: Settings,
        phase: 3,
        permission: P.SETTINGS_MANAGE,
      },
    ],
  },
];

/** Flat list of all nav items (used to generate routes). */
export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

/** Whether the current user may see a nav item / open its route. */
export function canAccess(item, { can, hasRole }) {
  if (item.permission && !can(item.permission)) return false;
  if (item.roles && !hasRole(...item.roles)) return false;
  return true;
}
