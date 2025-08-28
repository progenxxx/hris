import React, { useState, useEffect, useCallback } from 'react';
import { Head, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Sidebar from '@/Components/Sidebar';
import axios from 'axios';
import { 
    Calendar, 
    Users, 
    RotateCw, 
    Download, 
    RefreshCw, 
    TrendingUp,
    TrendingDown,
    CheckCircle,
    XCircle,
    Clock,
    AlertCircle,
    Settings,
    Filter,
    Search,
    ChevronDown,
    Eye,
    Play,
    Pause,
    FileText
} from 'lucide-react';
import { Button } from '@/Components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/card';
import { Alert, AlertDescription } from '@/Components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/Components/ui/tabs';
import { Badge } from '@/Components/ui/badge';
import { debounce } from 'lodash';

// Toast Component
const Toast = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 5000);
        
        return () => clearTimeout(timer);
    }, [onClose]);
    
    const bgColor = type === 'success' ? 'bg-green-50 border-green-200' : 
                   type === 'error' ? 'bg-red-50 border-red-200' : 
                   'bg-yellow-50 border-yellow-200';
    const textColor = type === 'success' ? 'text-green-700' : 
                     type === 'error' ? 'text-red-700' : 
                     'text-yellow-700';
    const icon = type === 'success' ? <CheckCircle className="h-5 w-5 text-green-500" /> : 
                type === 'error' ? <XCircle className="h-5 w-5 text-red-500" /> :
                <AlertCircle className="h-5 w-5 text-yellow-500" />;
    
    return (
        <div className={`fixed top-4 right-4 z-50 flex items-center p-4 mb-4 rounded-lg shadow-md border ${bgColor}`}>
            <div className="inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg">
                {icon}
            </div>
            <div className={`ml-3 text-sm font-normal ${textColor}`}>{message}</div>
            <button 
                type="button" 
                className={`ml-auto -mx-1.5 -my-1.5 rounded-lg focus:ring-2 p-1.5 inline-flex h-8 w-8 ${textColor} hover:bg-gray-100`} 
                onClick={onClose}
            >
                <XCircle className="w-5 h-5" />
            </button>
        </div>
    );
};

// Statistics Card Component
const StatsCard = ({ icon, title, value, subtitle, trend, color = "indigo" }) => (
    <Card className="border-t-4" style={{ borderTopColor: `var(--${color}-500)` }}>
        <CardContent className="p-6">
            <div className="flex items-center justify-between">
                <div className="flex-1">
                    <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                    {subtitle && (
                        <p className="text-xs text-gray-600 mt-1">{subtitle}</p>
                    )}
                </div>
                <div className={`p-3 rounded-full bg-${color}-100`}>
                    {icon}
                </div>
            </div>
            {trend && (
                <div className="flex items-center mt-4">
                    {trend.direction === 'up' ? 
                        <TrendingUp className="h-4 w-4 text-green-500 mr-1" /> :
                        <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                    }
                    <span className={`text-sm ${trend.direction === 'up' ? 'text-green-700' : 'text-red-700'}`}>
                        {trend.value} from last period
                    </span>
                </div>
            )}
        </CardContent>
    </Card>
);

// Sync Options Modal Component
const SyncOptionsModal = ({ isOpen, onClose, onSync, employees, isLoading }) => {
    const [syncOptions, setSyncOptions] = useState({
        create_missing: true,
        update_existing: false,
        include_schedules: true,
        include_attendance: true,
    });
    const [selectedEmployees, setSelectedEmployees] = useState([]);

    const handleSelectAll = () => {
        if (selectedEmployees.length === employees.length) {
            setSelectedEmployees([]);
        } else {
            setSelectedEmployees(employees.map(emp => emp.id));
        }
    };

    const handleEmployeeToggle = (employeeId) => {
        setSelectedEmployees(prev => 
            prev.includes(employeeId) 
                ? prev.filter(id => id !== employeeId)
                : [...prev, employeeId]
        );
    };

    const handleSync = () => {
        if (selectedEmployees.length === 0) {
            alert('Please select at least one employee to sync.');
            return;
        }
        onSync(selectedEmployees, syncOptions);
    };

    console.log('SyncOptionsModal render:', { 
        isOpen, 
        employeesLength: employees.length, 
        isLoading 
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">Sync Payroll Data</h2>
                
                <div className="space-y-6">
                    {/* Sync Options */}
                    <div>
                        <h3 className="text-lg font-medium mb-3">Sync Options</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={syncOptions.create_missing}
                                    onChange={(e) => setSyncOptions(prev => ({
                                        ...prev,
                                        create_missing: e.target.checked
                                    }))}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm">Create missing payroll summaries</span>
                            </label>
                            
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={syncOptions.update_existing}
                                    onChange={(e) => setSyncOptions(prev => ({
                                        ...prev,
                                        update_existing: e.target.checked
                                    }))}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm">Update existing summaries</span>
                            </label>
                            
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={syncOptions.include_schedules}
                                    onChange={(e) => setSyncOptions(prev => ({
                                        ...prev,
                                        include_schedules: e.target.checked
                                    }))}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm">Include schedule data</span>
                            </label>
                            
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={syncOptions.include_attendance}
                                    onChange={(e) => setSyncOptions(prev => ({
                                        ...prev,
                                        include_attendance: e.target.checked
                                    }))}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm">Include enhanced attendance data</span>
                            </label>
                        </div>
                    </div>

                    {/* Employee Selection */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-medium">Select Employees</h3>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleSelectAll}
                            >
                                {selectedEmployees.length === employees.length ? 'Deselect All' : 'Select All'}
                            </Button>
                        </div>
                        
                        <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
                            {employees.length === 0 ? (
                                <div className="p-4 text-center text-gray-500">
                                    No employees found
                                </div>
                            ) : (
                                <div className="p-2">
                                    {employees.map(employee => (
                                        <label 
                                            key={employee.id} 
                                            className="flex items-center space-x-3 py-2 px-2 hover:bg-gray-50 rounded cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedEmployees.includes(employee.id)}
                                                onChange={() => handleEmployeeToggle(employee.id)}
                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <div className="flex-1">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {employee.Fname} {employee.Lname}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {employee.idno} - {employee.Department}
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                {employee.employeeSchedules?.length || 0} schedules
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {selectedEmployees.length > 0 && (
                            <p className="text-sm text-gray-600 mt-2">
                                {selectedEmployees.length} employee{selectedEmployees.length !== 1 ? 's' : ''} selected
                            </p>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-3 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSync}
                            disabled={selectedEmployees.length === 0 || isLoading}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {isLoading ? (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    Syncing...
                                </>
                            ) : (
                                <>
                                    <RotateCw className="h-4 w-4 mr-2" />
                                    Sync Data
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Employee Details Modal Component
const EmployeeDetailsModal = ({ isOpen, onClose, employee, employeeDetails, isLoading }) => {
    if (!isOpen || !employee) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">
                        Employee Sync Details: {employee.Fname} {employee.Lname}
                    </h2>
                    <Button variant="outline" onClick={onClose}>
                        <XCircle className="h-4 w-4" />
                    </Button>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600 mr-3" />
                        <span className="text-gray-600">Loading employee details...</span>
                    </div>
                ) : employeeDetails ? (
                    <div className="space-y-6">
                        {/* Employee Info */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Employee Information</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <span className="text-sm text-gray-500">ID:</span>
                                        <p className="font-medium">{employee.idno}</p>
                                    </div>
                                    <div>
                                        <span className="text-sm text-gray-500">Department:</span>
                                        <p className="font-medium">{employee.Department}</p>
                                    </div>
                                    <div>
                                        <span className="text-sm text-gray-500">Job Title:</span>
                                        <p className="font-medium">{employee.Jobtitle || 'N/A'}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Payroll Summary */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Payroll Summary</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {employeeDetails.payroll_summary ? (
                                    <div className="grid grid-cols-4 gap-4">
                                        <div>
                                            <span className="text-sm text-gray-500">Days Worked:</span>
                                            <p className="font-medium">{employeeDetails.payroll_summary.days_worked}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-500">OT Hours:</span>
                                            <p className="font-medium">{employeeDetails.payroll_summary.ot_hours}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-500">SLVL Days:</span>
                                            <p className="font-medium">{employeeDetails.payroll_summary.slvl_days}</p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-gray-500">Status:</span>
                                            <Badge variant={employeeDetails.payroll_summary.status === 'posted' ? 'success' : 'default'}>
                                                {employeeDetails.payroll_summary.status}
                                            </Badge>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-gray-500 italic">No payroll summary found for this period</p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Related Data Tabs */}
                        <Tabs defaultValue="schedules" className="space-y-4">
                            <TabsList className="grid w-full grid-cols-8">
                                <TabsTrigger value="schedules">Schedules</TabsTrigger>
                                <TabsTrigger value="overtime">Overtime</TabsTrigger>
                                <TabsTrigger value="slvl">SLVL</TabsTrigger>
                                <TabsTrigger value="offsets">Offsets</TabsTrigger>
                                <TabsTrigger value="travel">Travel Orders</TabsTrigger>
                                <TabsTrigger value="retros">Retros</TabsTrigger>
                                <TabsTrigger value="schedule_changes">Schedule Changes</TabsTrigger>
                                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                            </TabsList>

                            <TabsContent value="schedules" className="space-y-4">
                                {employeeDetails.employee.employeeSchedules?.length > 0 ? (
                                    <div className="grid gap-4">
                                        {employeeDetails.employee.employeeSchedules.map((schedule, index) => (
                                            <Card key={index}>
                                                <CardContent className="p-4">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <span className="font-medium">{schedule.formatted_work_day}</span>
                                                            <span className="text-sm text-gray-500 ml-2">
                                                                ({schedule.shift_type_label})
                                                            </span>
                                                        </div>
                                                        <div className="text-sm">
                                                            {schedule.formatted_work_time}
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 italic">No schedules found for this period</p>
                                )}
                            </TabsContent>

                            <TabsContent value="overtime" className="space-y-4">
                                {employeeDetails.related_data?.overtime?.length > 0 ? (
                                    <div className="space-y-4">
                                        {employeeDetails.related_data.overtime.map((ot, index) => (
                                            <Card key={index}>
                                                <CardContent className="p-4">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <span className="font-medium">{ot.date}</span>
                                                            <span className="text-sm text-gray-500 ml-2">
                                                                {ot.total_hours} hours
                                                            </span>
                                                        </div>
                                                        <Badge variant={ot.status === 'approved' ? 'success' : 
                                                                     ot.status === 'rejected' ? 'destructive' : 'default'}>
                                                            {ot.status}
                                                        </Badge>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 italic">No overtime records found for this period</p>
                                )}
                            </TabsContent>

                            {/* Add other tab contents similarly */}
                            <TabsContent value="attendance" className="space-y-4">
                                {employeeDetails.attendance_summary ? (
                                    <Card>
                                        <CardContent className="p-6">
                                            <div className="grid grid-cols-4 gap-4">
                                                <div>
                                                    <span className="text-sm text-gray-500">Total Records:</span>
                                                    <p className="text-2xl font-bold">{employeeDetails.attendance_summary.total_records}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-gray-500">Days Present:</span>
                                                    <p className="text-2xl font-bold text-green-600">{employeeDetails.attendance_summary.days_present}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-gray-500">Days Absent:</span>
                                                    <p className="text-2xl font-bold text-red-600">{employeeDetails.attendance_summary.days_absent}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-gray-500">Hours Worked:</span>
                                                    <p className="text-2xl font-bold">{employeeDetails.attendance_summary.total_hours_worked}</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <p className="text-gray-500 italic">No attendance data found for this period</p>
                                )}
                            </TabsContent>
                        </Tabs>
                    </div>
                ) : (
                    <div className="text-center py-12 text-gray-500">
                        Failed to load employee details
                    </div>
                )}
            </div>
        </div>
    );
};

// Main Component
const PayrollScheduleIntegration = () => {
    const { 
        auth, 
        employees: initialEmployees, 
        payrollSummaries: initialPayrollSummaries,
        syncStats: initialSyncStats,
        departments,
        filters: initialFilters,
        periodInfo,
        availableYears,
        availableMonths
    } = usePage().props;

    // State management
    const [employees, setEmployees] = useState(initialEmployees || []);
    const [payrollSummaries, setPayrollSummaries] = useState(initialPayrollSummaries || {});
    const [syncStats, setSyncStats] = useState(initialSyncStats || {});
    const [filters, setFilters] = useState(initialFilters);
    const [isLoading, setIsLoading] = useState(false);

    // Debug logging
    console.log('PayrollScheduleIntegration Debug:', {
        initialEmployees: initialEmployees,
        employeesCount: (initialEmployees || []).length,
        employeesWithSchedules: (initialEmployees || []).filter(emp => emp.employeeSchedules?.length > 0).length,
        sampleEmployee: (initialEmployees || [])[0],
        filters: initialFilters
    });
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employeeDetails, setEmployeeDetails] = useState(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(initialFilters.search || '');

    // Toast state
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

    const showToast = (message, type = 'success') => {
        setToast({ visible: true, message, type });
    };

    const closeToast = () => {
        setToast(prev => ({ ...prev, visible: false }));
    };

    // Handle filter changes
    const handleFilterChange = useCallback((newFilters) => {
        try {
            setIsLoading(true);
            
            // Clean up null/undefined values
            const cleanFilters = Object.fromEntries(
                Object.entries(newFilters).filter(([key, value]) => 
                    value !== null && value !== undefined && value !== ''
                )
            );
            
            // Use Inertia to navigate with new filters
            window.location.href = `/payroll-schedule-integration?${new URLSearchParams(cleanFilters).toString()}`;
        } catch (error) {
            console.error('Error applying filters:', error);
            showToast('Failed to apply filters', 'error');
            setIsLoading(false);
        }
    }, []);

    // Debounced search handler
    const debouncedSearch = useCallback(
        debounce((searchValue) => {
            const newFilters = { ...filters, search: searchValue || null };
            handleFilterChange(newFilters);
        }, 500),
        [filters, handleFilterChange]
    );

    // Handle search input change
    const handleSearchChange = (e) => {
        const value = e.target.value;
        setSearchTerm(value);
        debouncedSearch(value);
    };

    // Handle sync data
    const handleSyncData = async (employeeIds, syncOptions) => {
        console.log('handleSyncData called:', {
            employeeIds,
            syncOptions,
            filters: filters
        });
        
        try {
            setIsLoading(true);
            const response = await axios.post('/payroll-schedule-integration/sync', {
                year: filters.year,
                month: filters.month,
                period_type: filters.period_type,
                employee_ids: employeeIds,
                sync_options: syncOptions
            });

            console.log('Sync response:', response.data);

            if (response.data.success) {
                showToast(response.data.message, 'success');
                setShowSyncModal(false);
                // Refresh the page data
                window.location.reload();
            } else {
                showToast(response.data.message || 'Sync failed', 'error');
            }
        } catch (error) {
            console.error('Error syncing data:', error);
            showToast(error.response?.data?.message || 'Failed to sync data', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Handle view employee details
    const handleViewEmployeeDetails = async (employee) => {
        try {
            setSelectedEmployee(employee);
            setShowEmployeeModal(true);
            setEmployeeDetails(null);

            const response = await axios.get(`/payroll-schedule-integration/employee/${employee.id}/details`, {
                params: {
                    year: filters.year,
                    month: filters.month,
                    period_type: filters.period_type
                }
            });

            if (response.data.success) {
                setEmployeeDetails(response.data.data);
            } else {
                showToast('Failed to load employee details', 'error');
            }
        } catch (error) {
            console.error('Error loading employee details:', error);
            showToast('Failed to load employee details', 'error');
        }
    };

    // Generate payroll summaries
    const handleGeneratePayroll = async () => {
        if (!confirm('Generate payroll summaries for all employees without existing records?')) {
            return;
        }

        try {
            setIsLoading(true);
            const response = await axios.post('/payroll-schedule-integration/generate', {
                year: filters.year,
                month: filters.month,
                period_type: filters.period_type,
                department: filters.department
            });

            if (response.data.success) {
                showToast(response.data.message, 'success');
                window.location.reload();
            } else {
                showToast(response.data.message || 'Generation failed', 'error');
            }
        } catch (error) {
            console.error('Error generating payroll:', error);
            showToast(error.response?.data?.message || 'Failed to generate payroll summaries', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Export data
    const handleExport = async () => {
        try {
            const response = await axios.post('/payroll-schedule-integration/export', {
                year: filters.year,
                month: filters.month,
                period_type: filters.period_type,
                department: filters.department,
                format: 'xlsx'
            });

            if (response.data.success) {
                showToast('Export completed successfully', 'success');
                // Handle file download here
            }
        } catch (error) {
            console.error('Error exporting data:', error);
            showToast('Failed to export data', 'error');
        }
    };

    return (
        <AuthenticatedLayout user={auth.user}>
            <Head title="Payroll Schedule Integration" />
            <div className="flex min-h-screen bg-gray-50">
                <Sidebar />
                <div className="flex-1 p-6">
                    <div className="max-w-7xl mx-auto">
                        {/* Toast */}
                        {toast.visible && (
                            <Toast 
                                message={toast.message}
                                type={toast.type}
                                onClose={closeToast}
                            />
                        )}

                        {/* Header Section */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center">
                                        <Settings className="h-6 w-6 mr-2 text-indigo-600" />
                                        Payroll Schedule Integration
                                    </h1>
                                    <p className="text-gray-600">
                                        Sync employee schedules with payroll data for {periodInfo.month_name} ({periodInfo.label})
                                    </p>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <Button
                                        onClick={handleExport}
                                        variant="outline"
                                        className="shadow-sm"
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        Export
                                    </Button>
                                    <Button
                                        onClick={handleGeneratePayroll}
                                        variant="outline"
                                        className="shadow-sm"
                                        disabled={isLoading}
                                    >
                                        <FileText className="h-4 w-4 mr-2" />
                                        Generate Payroll
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            console.log('Sync Data button clicked', { 
                                                employeesLength: employees.length,
                                                isLoading: isLoading
                                            });
                                            setShowSyncModal(true);
                                        }}
                                        className="bg-indigo-600 hover:bg-indigo-700 shadow-sm"
                                        disabled={isLoading || employees.length === 0}
                                    >
                                        <RotateCw className="h-4 w-4 mr-2" />
                                        Sync Data
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Statistics Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                            <StatsCard
                                icon={<Users className="h-5 w-5 text-indigo-600" />}
                                title="Total Employees"
                                value={syncStats.employees?.total || 0}
                                subtitle={`${syncStats.employees?.with_schedules || 0} with schedules`}
                                color="indigo"
                            />
                            <StatsCard
                                icon={<CheckCircle className="h-5 w-5 text-green-600" />}
                                title="With Payroll Data"
                                value={syncStats.employees?.with_payroll || 0}
                                subtitle={`${((syncStats.employees?.with_payroll || 0) / (syncStats.employees?.total || 1) * 100).toFixed(1)}% coverage`}
                                color="green"
                            />
                            <StatsCard
                                icon={<XCircle className="h-5 w-5 text-red-600" />}
                                title="Missing Payroll"
                                value={syncStats.employees?.missing_payroll || 0}
                                subtitle="Need generation"
                                color="red"
                            />
                            <StatsCard
                                icon={<Clock className="h-5 w-5 text-yellow-600" />}
                                title="Related Records"
                                value={Object.values(syncStats.related_data || {}).reduce((a, b) => a + b, 0)}
                                subtitle="OT, SLVL, Travel, etc."
                                color="yellow"
                            />
                        </div>

                        {/* Filter Section */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
                            <div className="flex flex-col gap-4">
                                {/* Search Bar */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                                    <input
                                        type="text"
                                        placeholder="Search employees by name, ID, department, or job title..."
                                        value={searchTerm}
                                        onChange={handleSearchChange}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    />
                                    {searchTerm && (
                                        <button
                                            onClick={() => {
                                                setSearchTerm('');
                                                const newFilters = { ...filters, search: null };
                                                handleFilterChange(newFilters);
                                            }}
                                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            <XCircle className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-col md:flex-row md:items-center gap-4">
                                    {/* Period Filters */}
                                    <div className="flex items-center space-x-4">
                                    <select
                                        value={filters.year}
                                        onChange={(e) => handleFilterChange({...filters, year: e.target.value})}
                                        className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {availableYears.map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                    
                                    <select
                                        value={filters.month}
                                        onChange={(e) => handleFilterChange({...filters, month: e.target.value})}
                                        className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {availableMonths.map(month => (
                                            <option key={month.value} value={month.value}>
                                                {month.label}
                                            </option>
                                        ))}
                                    </select>
                                    
                                    <select
                                        value={filters.period_type}
                                        onChange={(e) => handleFilterChange({...filters, period_type: e.target.value})}
                                        className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="1st_half">1st Half (1-15)</option>
                                        <option value="2nd_half">2nd Half (16-End)</option>
                                    </select>
                                </div>

                                <div className="flex-1">
                                    <select
                                        value={filters.department || ''}
                                        onChange={(e) => handleFilterChange({...filters, department: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">All Departments</option>
                                        {departments.map(dept => (
                                            <option key={dept} value={dept}>{dept}</option>
                                        ))}
                                    </select>
                                </div>

                                <Button
                                    variant="outline"
                                    onClick={() => window.location.reload()}
                                    disabled={isLoading}
                                >
                                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                                    Refresh
                                </Button>
                                </div>
                            </div>
                        </div>

                        {/* Employee List */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-4 border-b border-gray-100">
                                <h2 className="text-lg font-semibold">Employee Schedule & Payroll Status</h2>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Employee
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Department
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Schedules
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Payroll Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Last Sync
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {employees.length === 0 ? (
                                            <tr>
                                                <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                                                    <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                                                    <p className="text-lg font-medium">No employees found</p>
                                                    <p className="text-sm">Try adjusting your filters</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            employees.map(employee => {
                                                const payrollSummary = payrollSummaries[employee.id];
                                                const scheduleCount = employee.schedule_count || 
                                                                     employee.employeeSchedules?.length || 
                                                                     employee.employee_schedules?.length || 
                                                                     employee.schedules?.length || 0;
                                                
                                                // Debug logging for each employee
                                                console.log('Employee Debug:', {
                                                    id: employee.id,
                                                    name: `${employee.Fname} ${employee.Lname}`,
                                                    employeeSchedules: employee.employeeSchedules,
                                                    scheduleCount: scheduleCount,
                                                    allProperties: Object.keys(employee)
                                                });
                                                
                                                return (
                                                    <tr key={employee.id} className="hover:bg-gray-50">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center">
                                                                <div className="flex-shrink-0 h-10 w-10">
                                                                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                                                                        <Users className="h-5 w-5 text-indigo-600" />
                                                                    </div>
                                                                </div>
                                                                <div className="ml-4">
                                                                    <div className="text-sm font-medium text-gray-900">
                                                                        {employee.Fname} {employee.Lname}
                                                                    </div>
                                                                    <div className="text-sm text-gray-500">
                                                                        ID: {employee.idno}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm text-gray-900">{employee.Department}</div>
                                                            <div className="text-sm text-gray-500">{employee.Line}</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center">
                                                                <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                                                                <span className="text-sm text-gray-900">
                                                                    {scheduleCount} schedule{scheduleCount !== 1 ? 's' : ''}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            {payrollSummary ? (
                                                                <Badge variant="success">
                                                                    <CheckCircle className="h-3 w-3 mr-1" />
                                                                    {payrollSummary.status}
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="destructive">
                                                                    <XCircle className="h-3 w-3 mr-1" />
                                                                    Missing
                                                                </Badge>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                            {payrollSummary?.updated_at ? 
                                                                new Date(payrollSummary.updated_at).toLocaleDateString() : 
                                                                'Never'
                                                            }
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleViewEmployeeDetails(employee)}
                                                                className="mr-2"
                                                            >
                                                                <Eye className="h-4 w-4 mr-1" />
                                                                View
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Sync Options Modal */}
                        <SyncOptionsModal
                            isOpen={showSyncModal}
                            onClose={() => setShowSyncModal(false)}
                            onSync={handleSyncData}
                            employees={employees}
                            isLoading={isLoading}
                        />

                        {/* Employee Details Modal */}
                        <EmployeeDetailsModal
                            isOpen={showEmployeeModal}
                            onClose={() => setShowEmployeeModal(false)}
                            employee={selectedEmployee}
                            employeeDetails={employeeDetails}
                            isLoading={!employeeDetails && showEmployeeModal}
                        />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
};

export default PayrollScheduleIntegration;