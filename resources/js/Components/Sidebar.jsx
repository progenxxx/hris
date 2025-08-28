import React, { useState, useEffect, useRef } from 'react';
import { Link, usePage, router } from '@inertiajs/react';
import { 
    LayoutDashboard, 
    Users, 
    Clock, 
    Wallet, 
    FileText, 
    Settings, 
    Building2,
    UserCog,
    Calendar,
    FileBarChart,
    GraduationCap,
    CalendarCheck,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    Radio // Added for LIVE label icon
} from 'lucide-react';
import '../../css/sidebar.css'; // Fixed CSS import path

const MenuItem = ({ icon: Icon, label, items, path, isCollapsed, showLabels, isLive, openMenus, setOpenMenus }) => {
    // Use parent state to manage dropdown open/close
    const isSubmenuOpen = openMenus[label] || false;
    
    // Handle hover for collapsed menu items with submenus
    const [isHovering, setIsHovering] = useState(false);

    const toggleSubmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!isCollapsed) {
            setOpenMenus(prev => {
                // Close all other menus and toggle current one
                const newState = {};
                newState[label] = !prev[label];
                return newState;
            });
        }
    };

    // Helper function to determine if a path is external
    const isExternalPath = (url) => {
        return url && (url.startsWith('http://') || url.startsWith('https://'));
    };

    // Handle submenu item click - should NOT close the dropdown
    const handleSubmenuClick = (e) => {
        // Don't prevent default for navigation, but stop propagation to prevent dropdown toggle
        e.stopPropagation();
        // Keep the dropdown open by not modifying openMenus state
    };

    if (path) {
        const isExternalLink = isExternalPath(path);

        if (isExternalLink && isLive) {
            // Use regular anchor tag for external links (LIVE system opens in new tab)
            return (
                <a 
                    href={path}
                    className="block mb-1 group relative"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <div className={`flex items-center px-4 py-2.5 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-all duration-200 menu-item ${isLive ? 'bg-red-50 text-red-600' : ''}`}>
                        {Icon && <Icon className={`w-5 h-5 mr-3 ${isLive ? 'text-red-600 animate-pulse' : ''}`} />}
                        {(!isCollapsed && showLabels) && (
                            <div className="flex items-center">
                                <span className={`flex-1 font-medium ${isLive ? 'text-red-600' : ''}`}>{label}</span>
                                {isLive && (
                                    <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-red-600 text-white rounded-full animate-pulse">
                                        LIVE
                                    </span>
                                )}
                            </div>
                        )}
                        {/* Fixed LIVE indicator for collapsed sidebar */}
                        {(isCollapsed && isLive) && (
                            <div className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 flex items-center bg-red-600 text-white px-2 py-1 rounded text-xs font-bold whitespace-nowrap z-50 animate-pulse">
                                LIVE
                            </div>
                        )}
                    </div>
                </a>
            );
        } else {
            // Use Inertia Link for internal routes (no new tab)
            return (
                <Link 
                    href={path}
                    className="block mb-1 group"
                >
                    <div className="flex items-center px-4 py-2.5 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-all duration-200 menu-item">
                        {Icon && <Icon className="w-5 h-5 mr-3" />}
                        {(!isCollapsed && showLabels) && (
                            <span className="flex-1 font-medium">{label}</span>
                        )}
                    </div>
                </Link>
            );
        }
    }

    return (
        <div 
            className="mb-1 relative"
            onMouseEnter={() => isCollapsed && setIsHovering(true)}
            onMouseLeave={() => isCollapsed && setIsHovering(false)}
        >
            <div 
                className={`flex items-center px-4 py-2.5 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg cursor-pointer transition-all duration-200 menu-item ${isSubmenuOpen ? 'bg-indigo-50 text-indigo-600' : ''}`}
                onClick={toggleSubmenu}
            >
                {Icon && <Icon className="w-5 h-5 mr-3" />}
                {(!isCollapsed && showLabels) && (
                    <>
                        <span className="flex-1 font-medium">{label}</span>
                        <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isSubmenuOpen ? 'rotate-90' : ''}`} />
                    </>
                )}
            </div>
            
            {/* Dropdown for collapsed sidebar on hover */}
            {isCollapsed && isHovering && items && (
                <div className="absolute left-full top-0 ml-2 bg-white shadow-lg rounded-lg py-2 z-50 min-w-48 border border-gray-100">
                    <div className="px-4 py-2 text-sm font-medium text-gray-800 border-b border-gray-100 mb-1">
                        {label}
                    </div>
                    {items.map((subItem, index) => {
                        const isExternalLink = isExternalPath(subItem.path);
                        
                        return isExternalLink ? (
                            <a
                                key={index}
                                href={subItem.path}
                                className="block px-4 py-2 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all duration-200"
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => {
                                    // Hide the hover dropdown after clicking external link
                                    setIsHovering(false);
                                }}
                            >
                                {subItem.label}
                            </a>
                        ) : (
                            <Link
                                key={index}
                                href={subItem.path}
                                className="block px-4 py-2 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all duration-200"
                                onClick={() => {
                                    // Hide the hover dropdown after clicking internal link
                                    setIsHovering(false);
                                }}
                            >
                                {subItem.label}
                            </Link>
                        );
                    })}
                </div>
            )}
            
            {/* Regular dropdown for expanded sidebar */}
            {isSubmenuOpen && !isCollapsed && items && (
                <div className="ml-6 mt-1 space-y-1">
                    {items.map((subItem, index) => {
                        const isExternalLink = isExternalPath(subItem.path);
                        
                        return isExternalLink ? (
                            <a
                                key={index}
                                href={subItem.path}
                                className="block px-4 py-2 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-all duration-200"
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={handleSubmenuClick}
                            >
                                {subItem.label}
                            </a>
                        ) : (
                            <Link
                                key={index}
                                href={subItem.path}
                                className="block px-4 py-2 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-all duration-200"
                                onClick={handleSubmenuClick}
                            >
                                {subItem.label}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const Sidebar = ({ showSidebar = true }) => {
    const { auth } = usePage().props;
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [userRole, setUserRole] = useState('No Role Assigned');
    const [userRoles, setUserRoles] = useState([]);
    const [openMenus, setOpenMenus] = useState({}); // State to track which menus are open
    const sidebarRef = useRef(null);
    
    // Debug and process roles on component mount
    useEffect(() => {
        console.log('Auth data:', auth);
        console.log('User object:', auth?.user);
        console.log('Roles array:', auth?.user?.roles);
        
        if (auth?.user) {
            // Use the roles array if it exists
            if (Array.isArray(auth.user.roles) && auth.user.roles.length > 0) {
                setUserRoles(auth.user.roles);
                setUserRole(auth.user.roles.map(role => role.name).join(', '));
            } 
            // Check if user has a role from the getRoleSlug method
            else if (auth.user.role_slug) {
                setUserRoles([{ name: auth.user.role_slug, slug: auth.user.role_slug }]);
                setUserRole(auth.user.role_slug.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()));
            }
            // Fallback: Try using API call
            else {
                // Make an API call to get the user's role if needed
                fetch(`/api/user/${auth.user.id}/roles`)
                    .then(response => response.json())
                    .then(data => {
                        if (data.roles && data.roles.length > 0) {
                            setUserRoles(data.roles);
                            setUserRole(data.roles.map(role => role.name).join(', '));
                        } else {
                            // If no roles found via API, fallback to default
                            setUserRole('No Role Assigned');
                            setUserRoles([]);
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching user roles:', error);
                        // Default to superadmin access during development
                        setUserRoles([{ name: 'superadmin', slug: 'superadmin' }]);
                        setUserRole('Super Admin');
                    });
            }
        }
    }, [auth]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (sidebarRef.current && !sidebarRef.current.contains(event.target)) {
                setOpenMenus({});
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const hasAccess = (allowedRoles) => {
        // During development or if roles are missing, show all items by default
        if (!userRoles.length) return true;
        
        return allowedRoles.some(role => 
            userRoles.some(userRole => 
                userRole.name?.toLowerCase() === role.toLowerCase() || 
                userRole.slug?.toLowerCase() === role.toLowerCase()
            )
        );
    };

    // Determine which dashboard to show based on user role
    const getDashboardRoute = () => {
        if (hasAccess(['superadmin'])) {
            return route('superadmin.dashboard');
        } else if (hasAccess(['hrd_manager'])) {
            return route('hrd_manager.dashboard');
        } else if (hasAccess(['department_manager'])) {
            return route('department_manager.dashboard');
        } else if (hasAccess(['finance'])) {
            return route('finance.dashboard');
        } else {
            return route('employee.dashboard');
        }
    };

    const menuItems = [
        {
            icon: LayoutDashboard,
            label: 'Dashboard',
            path: getDashboardRoute(),
            allowedRoles: ['superadmin', 'hrd_manager', 'department_manager', 'finance', 'employee']
        },
        {
            icon: Users,
            label: 'Employees',
            allowedRoles: ['superadmin', 'finance', 'hrd_manager'],
            items: [
                { label: 'Employee List', path: route('employees.index') }, 
                { label: 'Import Employees', path: route('employees.import') }
            ]
        },
        {
            icon: ClipboardCheck,
            label: 'Timesheets',
            allowedRoles: ['superadmin', 'hrd_manager'],
            items: [
                { label: 'DTR', path: '/payroll-summaries-page' },
                /* { label: 'Attendance Report', path: '/timesheets/dtr' }, */
                { label: 'Process Attendance', path: '/attendance' },
                { label: 'Manual Entry', path: '/timesheet/manual-entry' },
                { label: 'Biometrics', path: '/biometric-devices' },
                { label: 'Import Attendance', path: '/attendance/import' },
                { label: 'Employee Schedule', path: '/employee-scheduling' }
            ]
        },
        {
            icon: Wallet,
            label: 'Payroll',
            allowedRoles: ['superadmin', 'finance'],
            items: [
                { label: 'Final Payroll', path: '/final-payrolls' },
                { label: 'Payroll Summary', path: '/comprehensive-payroll-summaries' },
                { label: 'Benefits', path: '/benefits' },
                { label: 'Deductions', path: '/deductions' },
                /* { label: 'Contribution Lists', path: '/payroll/contributions' },
                { label: 'Deduction Lists', path: '/payroll/deductions' },
                { label: 'Debit Summary', path: '/payroll/debit' },
                { label: 'Credit Summary', path: '/payroll/credit' },
                { label: 'SLVL Summary', path: '/payroll/slvl' } */
            ]
        },
        {
            icon: FileText,
            label: 'File',
            allowedRoles: ['superadmin', 'hrd_manager'],
            items: [
                { label: 'Overtime', path: '/overtimes' },
                { label: 'Offset', path: '/offsets' },
                { label: 'Change Restday', path: '/change-off-schedules' },
                { label: 'Cancel Restday', path: '/cancel-rest-days' },
                { label: 'Change Time Sched', path: '/time-schedules' },
                { label: 'SLVL', path: '/slvl' },
                { label: 'Travel Order', path: '/travel-orders' },
                { label: 'Retro', path: '/retro' }
            ]
        },
        {
            icon: Building2,
            label: 'Manage',
            allowedRoles: ['superadmin', 'hrd'],
            items: [
                { label: 'Line & Section', path: '/manage/line-section' },
                { label: 'Departments', path: '/manage/departments' },
                { label: 'Roles And Access', path: '/manage/roles' }
            ]
        },
        {
            icon: UserCog,
            label: 'Core HR',
            allowedRoles: ['superadmin', 'hrd'],
            items: [
                { label: 'Promotion', path: '/core-hr/promotion' },
                { label: 'Award', path: '/core-hr/award' },
                { label: 'Travel', path: '/core-hr/travel' },
                { label: 'Transfer', path: '/core-hr/transfer' },
                { label: 'Resignations', path: '/core-hr/resignations' },
                { label: 'Complaints', path: '/core-hr/complaints' },
                { label: 'Warnings', path: '/core-hr/warnings' },
                { label: 'Terminations', path: '/core-hr/terminations' }
            ]
        },
        {
            icon: Calendar,
            label: 'HR Calendar',
            allowedRoles: ['superadmin', 'hrd'],
            path: '/hr-calendar'
        },
        {
            icon: FileBarChart,
            label: 'HR Reports',
            allowedRoles: ['superadmin', 'hrd'],
            items: [
                { label: 'Daily Attendances', path: '/reports/daily-attendance' },
                { label: 'Monthly Attendance', path: '/reports/monthly-attendance' },
                { label: 'Training Report', path: '/reports/training' }
            ]
        },
        {
            icon: GraduationCap,
            label: 'Training',
            allowedRoles: ['superadmin', 'hrd'],
            items: [
                { label: 'Training Lists', path: '/training/lists' },
                { label: 'Training Type', path: '/training/types' },
                { label: 'Trainers', path: '/training/trainers' }
            ]
        },
        {
            icon: CalendarCheck,
            label: 'Events & Meetings',
            allowedRoles: ['superadmin', 'hrd'],
            items: [
                { label: 'Events', path: '/events' },
                { label: 'Meetings', path: '/meetings' }
            ]
        },
        {
            icon: Settings,
            label: 'Settings',
            allowedRoles: ['superadmin'],
            path: '/settings'
        },
        
        {
            icon: Radio,
            label: 'LIVE SYSTEM',
            path: 'http://26.126.108.183:8888',
            allowedRoles: ['superadmin', 'hrd_manager', 'department_manager', 'finance', 'employee'],
            isLive: true 
        }
    ];

    return (
        <aside 
            ref={sidebarRef}
            className={`fixed top-0 left-0 z-50 h-screen transition-all duration-300 ease-in-out shadow-md ${!showSidebar ? 'hidden' : ''}`} 
            aria-label="Sidebar"
        >
            <div className={`h-full bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out relative overflow-hidden ${isCollapsed ? 'w-20' : 'w-64'}`}>
                {/* Smoke animation background */}
                <div className="smoke-animation"></div>
                <div className="p-4 flex items-center justify-between border-b border-gray-200 relative z-10">
                    {!isCollapsed && (
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 tracking-tight">
                                Dashboard
                            </h2>
                            <p className="text-sm text-gray-500">
                                {userRole}
                            </p>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        {!isCollapsed && (
                            <button 
                                onClick={() => setShowLabels(!showLabels)}
                                className="p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
                                aria-label={showLabels ? "Hide labels" : "Show labels"}
                                title={showLabels ? "Hide labels" : "Show labels"}
                            >
                                {/* Icon code removed for brevity */}
                            </button>
                        )}
                        <button
                            onClick={() => {
                                setIsCollapsed(!isCollapsed);
                                // Close all dropdowns when collapsing
                                if (!isCollapsed) {
                                    setOpenMenus({});
                                }
                            }}
                            className={`p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 relative z-20 ${isCollapsed ? 'mx-auto' : ''}`}
                            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            {isCollapsed ? (
                                <ChevronRight className="w-5 h-5 text-gray-600" />
                            ) : (
                                <ChevronLeft className="w-5 h-5 text-gray-600" />
                            )}
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                    <nav className="mt-4 px-2">
                        {menuItems
                            .filter(item => hasAccess(item.allowedRoles))
                            .map((item, index) => (
                                <MenuItem
                                    key={index}
                                    icon={item.icon}
                                    label={item.label}
                                    items={item.items}
                                    path={item.path}
                                    isCollapsed={isCollapsed}
                                    showLabels={showLabels}
                                    isLive={item.isLive}
                                    openMenus={openMenus}
                                    setOpenMenus={setOpenMenus}
                                />
                            ))}
                    </nav>
                </div>
                <div className="p-4 border-t border-gray-200">
                    <p className="text-xs text-gray-500 text-center">
                        {!isCollapsed && "© 2025 Company Name"}
                    </p>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;