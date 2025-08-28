import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Download, Search, X, Filter, Loader2, Edit3 } from 'lucide-react';
import OvertimeStatusBadge from './OvertimeStatusBadge';
import OvertimeDetailModal from './OvertimeDetailModal';
import OvertimeRateEditModal from './OvertimeRateEditModal';
import MultiBulkActionModal from './MultiBulkActionModal';
import ForceApproveButton from './ForceApproveButton';
import { router } from '@inertiajs/react';
import { toast } from 'react-toastify';

const OvertimeList = ({ 
    overtimes, 
    onStatusUpdate, 
    onDelete, 
    refreshInterval = 5000,
    userRoles = {},
    processing = false // Add this prop from parent
}) => {
    const [selectedOvertime, setSelectedOvertime] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [showRateEditModal, setShowRateEditModal] = useState(false);
    const [selectedOvertimeForRate, setSelectedOvertimeForRate] = useState(null);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterOvertimeType, setFilterOvertimeType] = useState(''); // New filter
    const [filteredOvertimes, setFilteredOvertimes] = useState(overtimes || []);
    const [localOvertimes, setLocalOvertimes] = useState(overtimes || []);
    const timerRef = useRef(null);
    
    // Loading states for various operations
    const [localProcessing, setLocalProcessing] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [updatingId, setUpdatingId] = useState(null);
    const [exporting, setExporting] = useState(false);
    
    // Search functionality
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState({ from: '', to: '' });
    
    // For multiple selection
    const [selectedIds, setSelectedIds] = useState([]);
    const [showBulkActionModal, setShowBulkActionModal] = useState(false);
    const [selectAll, setSelectAll] = useState(false);
    
    // Overtime type options for filtering
    const overtimeTypes = {
        'regular_weekday': 'Regular Weekday',
        'rest_day': 'Rest Day',
        'scheduled_rest_day': 'Scheduled Rest Day',
        'regular_holiday': 'Regular Holiday',
        'special_holiday': 'Special Holiday',
        'emergency_work': 'Emergency Work',
        'extended_shift': 'Extended Shift',
        'weekend_work': 'Weekend Work',
        'night_shift': 'Night Shift',
        'other': 'Other'
    };
    
    // Update local state when props change
    useEffect(() => {
        if (!overtimes) return; // Guard against undefined overtimes prop
        setLocalOvertimes(overtimes);
        applyFilters(overtimes, filterStatus, filterOvertimeType, searchTerm, dateRange);
        
        // Clear selections if data has changed (after rate edit)
        setSelectedIds([]);
        setSelectAll(false);
    }, [overtimes]);
    
    // Set up auto-refresh timer
    useEffect(() => {
        // Function to fetch fresh data
        const refreshData = async () => {
            try {
                // Here you would typically fetch fresh data from your API
                if (typeof window.refreshOvertimes === 'function') {
                    const freshData = await window.refreshOvertimes();
                    setLocalOvertimes(freshData);
                    applyFilters(freshData, filterStatus, filterOvertimeType, searchTerm, dateRange);
                }
            } catch (error) {
                console.error('Error refreshing overtime data:', error);
            }
        };
        
        // Set up interval only if not processing
        if (!processing && !localProcessing) {
            timerRef.current = setInterval(refreshData, refreshInterval);
        }
        
        // Clean up on component unmount or when processing starts
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [refreshInterval, filterStatus, filterOvertimeType, searchTerm, dateRange, processing, localProcessing]);

    
    
    // Function to apply all filters
    const applyFilters = (data, status, overtimeType, search, dates) => {
        let result = [...data];
        
        // Apply status filter
        if (status) {
            result = result.filter(ot => ot.status === status);
        }
        
        // Apply overtime type filter
        if (overtimeType) {
            result = result.filter(ot => ot.overtime_type === overtimeType);
        }
        
        // Apply search filter
        if (search) {
            const searchLower = search.toLowerCase();
            result = result.filter(ot => 
                // Search by employee name
                (ot.employee && 
                    ((ot.employee.Fname && ot.employee.Fname.toLowerCase().includes(searchLower)) || 
                     (ot.employee.Lname && ot.employee.Lname.toLowerCase().includes(searchLower)))) ||
                // Search by employee ID
                (ot.employee && ot.employee.idno && ot.employee.idno.toString().includes(searchLower)) ||
                // Search by department
                (ot.employee && ot.employee.Department && ot.employee.Department.toLowerCase().includes(searchLower)) ||
                // Search by reason
                (ot.reason && ot.reason.toLowerCase().includes(searchLower)) ||
                // Search by overtime type
                (ot.overtime_type && ot.overtime_type.toLowerCase().includes(searchLower))
            );
        }
        
        // Apply date range filter
        if (dates.from && dates.to) {
            result = result.filter(ot => {
                if (!ot.date) return false;
                const overtimeDate = new Date(ot.date);
                const fromDate = new Date(dates.from);
                const toDate = new Date(dates.to);
                toDate.setHours(23, 59, 59); // Include the entire "to" day
                
                return overtimeDate >= fromDate && overtimeDate <= toDate;
            });
        } else if (dates.from) {
            result = result.filter(ot => {
                if (!ot.date) return false;
                const overtimeDate = new Date(ot.date);
                const fromDate = new Date(dates.from);
                return overtimeDate >= fromDate;
            });
        } else if (dates.to) {
            result = result.filter(ot => {
                if (!ot.date) return false;
                const overtimeDate = new Date(ot.date);
                const toDate = new Date(dates.to);
                toDate.setHours(23, 59, 59); // Include the entire "to" day
                return overtimeDate <= toDate;
            });
        }
        
        setFilteredOvertimes(result);
        return result; // Return the filtered results
    };
    
    // Handle status filter change
    const handleStatusFilterChange = (e) => {
        if (processing || localProcessing) return;
        const status = e.target.value;
        setFilterStatus(status);
        applyFilters(localOvertimes, status, filterOvertimeType, searchTerm, dateRange);
    };
    
    // Handle overtime type filter change
    const handleOvertimeTypeFilterChange = (e) => {
        if (processing || localProcessing) return;
        const overtimeType = e.target.value;
        setFilterOvertimeType(overtimeType);
        applyFilters(localOvertimes, filterStatus, overtimeType, searchTerm, dateRange);
    };
    
    // Handle search input change
    const handleSearchChange = (e) => {
        if (processing || localProcessing) return;
        const value = e.target.value;
        setSearchTerm(value);
        applyFilters(localOvertimes, filterStatus, filterOvertimeType, value, dateRange);
    };
    
    // Handle date range changes
    const handleDateRangeChange = (field, value) => {
        if (processing || localProcessing) return;
        const newDateRange = { ...dateRange, [field]: value };
        setDateRange(newDateRange);
        applyFilters(localOvertimes, filterStatus, filterOvertimeType, searchTerm, newDateRange);
    };
    
    // Clear all filters
    const clearFilters = () => {
        if (processing || localProcessing) return;
        setFilterStatus('');
        setFilterOvertimeType('');
        setSearchTerm('');
        setDateRange({ from: '', to: '' });
        applyFilters(localOvertimes, '', '', '', { from: '', to: '' });
    };
    
    // Get overtime type label
    const getOvertimeTypeLabel = (type) => {
        return overtimeTypes[type] || type?.replace('_', ' ')?.replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown';
    };
    
    // Format overtime type with night differential
    const formatOvertimeDescription = (overtime) => {
        let description = getOvertimeTypeLabel(overtime.overtime_type);
        if (overtime.has_night_differential) {
            description += ' (Night Diff.)';
        }
        return description;
    };
    
    const refreshOvertimeData = () => {
    console.log('Starting refresh...');
    setLocalProcessing(true);
    
    router.reload({
        only: ['overtimes'], // or whatever your actual prop name is
        preserveScroll: true,
        preserveState: true,
        onBefore: () => {
            console.log('About to reload...');
        },
        onStart: () => {
            console.log('Reload started...');
        },
        onSuccess: (page) => {
            console.log('Refresh successful, new data:', page.props);
            setLocalProcessing(false);
            toast.success('Data refreshed successfully');
        },
        onError: (errors) => {
            console.error('Error refreshing data:', errors);
            toast.error('Failed to refresh data');
            setLocalProcessing(false);
        },
        onFinish: () => {
            console.log('Refresh finished');
            setLocalProcessing(false);
        }
    });
};
    
    // Open detail modal
    const handleViewDetail = (overtime) => {
        if (processing || localProcessing) return;
        
        // Pause auto-refresh when modal is open
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
        
        setSelectedOvertime(overtime);
        setShowModal(true);
    };
    
    // Close detail modal
    const handleCloseModal = () => {
        setShowModal(false);
        setSelectedOvertime(null);
        
        // Resume auto-refresh when modal is closed
        if (!processing && !localProcessing) {
            const refreshData = async () => {
                try {
                    if (typeof window.refreshOvertimes === 'function') {
                        const freshData = await window.refreshOvertimes();
                        setLocalOvertimes(freshData);
                        applyFilters(freshData, filterStatus, filterOvertimeType, searchTerm, dateRange);
                    }
                } catch (error) {
                    console.error('Error refreshing overtime data:', error);
                }
            };
            
            timerRef.current = setInterval(refreshData, refreshInterval);
        }
    };
    
    // Handle rate edit modal
    const handleEditRate = (overtime) => {
        if (processing || localProcessing) return;
        
        // Only allow editing if overtime is pending
        if (overtime.status !== 'pending') {
            toast.warning('Rate can only be edited for pending overtime requests');
            return;
        }
        
        // Check if user has permission to edit rate
        const canEdit = userRoles.isSuperAdmin ||
                       userRoles.isHrdManager ||
                       userRoles.isDepartmentManager ||
                       overtime.created_by === userRoles.userId;
        
        if (!canEdit) {
            toast.error('You do not have permission to edit this overtime rate');
            return;
        }
        
        // Pause auto-refresh when modal is open
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
        
        setSelectedOvertimeForRate(overtime);
        setShowRateEditModal(true);
    };
    
    // Close rate edit modal and refresh data
    const handleCloseRateEditModal = (shouldRefresh = false) => {
        setShowRateEditModal(false);
        setSelectedOvertimeForRate(null);
        
        // If the modal indicates data was updated, refresh immediately
        if (shouldRefresh) {
            refreshOvertimeData();
        }
        
        // Resume auto-refresh when modal is closed
        if (!processing && !localProcessing) {
            const refreshData = async () => {
                try {
                    if (typeof window.refreshOvertimes === 'function') {
                        const freshData = await window.refreshOvertimes();
                        setLocalOvertimes(freshData);
                        applyFilters(freshData, filterStatus, filterOvertimeType, searchTerm, dateRange);
                    }
                } catch (error) {
                    console.error('Error refreshing overtime data:', error);
                }
            };
            
            timerRef.current = setInterval(refreshData, refreshInterval);
        }
    };
    
    // Handle rate edit success callback
    const handleRateEditSuccess = () => {
        // Close modal and refresh data
        handleCloseRateEditModal(true);
    };
    
    // Handle rate update success - This will be called from the modal
    const handleRateUpdateSuccess = (updatedOvertimes) => {
        if (updatedOvertimes) {
            // Update local overtimes with the new data from server
            setLocalOvertimes(updatedOvertimes);
            // Apply current filters to the updated data
            applyFilters(updatedOvertimes, filterStatus, filterOvertimeType, searchTerm, dateRange);
        } else {
            // Fallback: refresh data manually if no data provided
            refreshOvertimeData();
        }
    };
    
    // Handle double click on row to edit rate
    const handleRowDoubleClick = (overtime, event) => {
        // Prevent double click on action buttons
        if (event.target.closest('button') || event.target.closest('input[type="checkbox"]')) {
            return;
        }
        
        // Only allow double click edit for pending status
        if (overtime.status === 'pending') {
            handleEditRate(overtime);
        }
    };
    
    // Check if user can edit rate for an overtime
    const canEditRate = (overtime) => {
        if (overtime.status !== 'pending') return false;
        
        return userRoles.isSuperAdmin ||
               userRoles.isHrdManager ||
               userRoles.isDepartmentManager ||
               overtime.created_by === userRoles.userId;
    };
    
    // Check if overtime rate has been edited
    const isRateEdited = (overtime) => {
        return overtime.rate_edited === true || overtime.rate_edited === 1;
    };
    
    // Get row styling based on edit status
    const getRowStyling = (overtime) => {
        const baseClasses = "transition-colors duration-200";
        const processingClasses = (deletingId === overtime.id || updatingId === overtime.id) ? 'opacity-50' : '';
        
        if (isRateEdited(overtime)) {
            // Red styling for edited rows
            return `${baseClasses} ${processingClasses} bg-red-50 border-l-4 border-red-400 hover:bg-red-100`;
        } else if (canEditRate(overtime)) {
            // Blue styling for editable rows
            return `${baseClasses} ${processingClasses} hover:bg-blue-50 cursor-pointer`;
        } else {
            // Default styling
            return `${baseClasses} ${processingClasses} hover:bg-gray-50`;
        }
    };
    
    // Handle status update (from modal)
    const handleStatusUpdate = (id, data) => {
        setUpdatingId(id);
        setLocalProcessing(true);
        
        // Check if onStatusUpdate is a function before calling it
        if (typeof onStatusUpdate === 'function') {
            try {
                const result = onStatusUpdate(id, data);
                
                // If it returns a promise, handle it
                if (result && typeof result.then === 'function') {
                    result
                        .then(() => {
                            setUpdatingId(null);
                            setLocalProcessing(false);
                        })
                        .catch((error) => {
                            console.error('Error updating status:', error);
                            alert('Error: Unable to update status. Please try again.');
                            setUpdatingId(null);
                            setLocalProcessing(false);
                        });
                } else {
                    // If not a promise, assume it completed
                    setUpdatingId(null);
                    setLocalProcessing(false);
                }
            } catch (error) {
                console.error('Error updating status:', error);
                alert('Error: Unable to update status. Please try again.');
                setUpdatingId(null);
                setLocalProcessing(false);
            }
        } else {
            console.error('onStatusUpdate prop is not a function');
            alert('Error: Unable to update status. Please refresh the page and try again.');
            setUpdatingId(null);
            setLocalProcessing(false);
        }
        handleCloseModal();
    };
    
    const handleDelete = (id) => {
        if (confirm('Are you sure you want to delete this overtime request?')) {
            setDeletingId(id);
            setLocalProcessing(true);
            
            router.post(route('overtimes.destroy.post', id), {}, {
                preserveScroll: true,
                onSuccess: (page) => {
                    // Update local state after successful deletion
                    const updatedOvertimes = localOvertimes.filter(ot => ot.id !== id);
                    setLocalOvertimes(updatedOvertimes);
                    
                    // Apply filters to the updated list
                    applyFilters(updatedOvertimes, filterStatus, filterOvertimeType, searchTerm, dateRange);
                    
                    toast.success('Overtime deleted successfully');
                    setDeletingId(null);
                    setLocalProcessing(false);
                },
                onError: (errors) => {
                    console.error('Error deleting overtime:', errors);
                    toast.error('Failed to delete overtime');
                    setDeletingId(null);
                    setLocalProcessing(false);
                }
            });
        }
    };
    
    // Format date safely
    const formatDate = (dateString) => {
        try {
            return format(new Date(dateString), 'yyyy-MM-dd');
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'Invalid date';
        }
    };
    
    const formatTime = (timeString) => {
        if (!timeString) return '-';
        
        try {
            let timeOnly;
            // Handle ISO 8601 format
            if (timeString.includes('T')) {
                const [, time] = timeString.split('T');
                timeOnly = time.slice(0, 5); // Extract HH:MM
            } else {
                // If the time includes a date (like "2024-04-10 14:30:00"), split and take the time part
                const timeParts = timeString.split(' ');
                timeOnly = timeParts[timeParts.length - 1].slice(0, 5);
            }
            
            // Parse hours and minutes
            const [hours, minutes] = timeOnly.split(':');
            const hourNum = parseInt(hours, 10);
            
            // Convert to 12-hour format with AM/PM
            const ampm = hourNum >= 12 ? 'PM' : 'AM';
            const formattedHours = hourNum % 12 || 12; // handle midnight and noon
            
            return `${formattedHours}:${minutes} ${ampm}`;
        } catch (error) {
            console.error('Time formatting error:', error);
            return '-';
        }
    };

    // Multiple selection handlers
    const toggleSelectAll = () => {
        if (processing || localProcessing) return;
        
        setSelectAll(!selectAll);
        if (!selectAll) {
            // Only select appropriate overtimes based on user role
            let selectableIds = [];
            
            if (userRoles.isDepartmentManager) {
                // Department managers can only select pending overtimes they are responsible for
                selectableIds = filteredOvertimes
                    .filter(ot => ot.status === 'pending' && 
                           (ot.dept_manager_id === userRoles.userId || 
                            userRoles.managedDepartments?.includes(ot.employee?.Department)))
                    .map(ot => ot.id);
            } else if (userRoles.isHrdManager) {
                // HRD managers can select pending or manager_approved overtimes
                selectableIds = filteredOvertimes
                    .filter(ot => ot.status === 'manager_approved')
                    .map(ot => ot.id);
            } else if (userRoles.isSuperAdmin) {
                // Superadmins can select any pending or manager_approved overtime
                selectableIds = filteredOvertimes
                    .filter(ot => ot.status === 'pending' || ot.status === 'manager_approved')
                    .map(ot => ot.id);
            }
            
            setSelectedIds(selectableIds);
        } else {
            setSelectedIds([]);
        }
    };

    const toggleSelectItem = (id) => {
        if (processing || localProcessing) return;
        
        setSelectedIds(prevIds => {
            if (prevIds.includes(id)) {
                return prevIds.filter(itemId => itemId !== id);
            } else {
                return [...prevIds, id];
            }
        });
    };

    const handleOpenBulkActionModal = () => {
        if (selectedIds.length === 0) {
            alert('Please select at least one overtime request');
            return;
        }
        if (processing || localProcessing) return;
        setShowBulkActionModal(true);
    };

    const handleCloseBulkActionModal = () => {
        setShowBulkActionModal(false);
    };

    const handleBulkStatusUpdate = (status, remarks) => {
        setLocalProcessing(true);
        
        // Create data for bulk update
        const data = {
            overtime_ids: selectedIds,
            status: status,
            remarks: remarks
        };
        
        // Make direct API call instead of using individual promises
        router.post(route('overtimes.bulkUpdateStatus'), data, {
            preserveScroll: true,
            onSuccess: (response) => {
                // Clear selections after successful update
                setSelectedIds([]);
                setSelectAll(false);
                
                // Refresh the data - this is important to get updated records
                router.reload({
                    only: ['overtimes'],
                    preserveScroll: true,
                    onFinish: () => {
                        setLocalProcessing(false);
                    }
                });
            },
            onError: (errors) => {
                console.error('Error during bulk update:', errors);
                toast.error('Failed to update overtime requests: ' + 
                    (errors?.message || 'Unknown error'));
                setLocalProcessing(false);
            }
        });
        
        handleCloseBulkActionModal();
    };
    
    // Export to Excel functionality - Server-side implementation
    const exportToExcel = () => {
        if (processing || localProcessing || exporting) return;
        
        setExporting(true);
        
        // Build query parameters from current filters
        const queryParams = new URLSearchParams();
        
        if (filterStatus) {
            queryParams.append('status', filterStatus);
        }
        
        if (filterOvertimeType) {
            queryParams.append('overtime_type', filterOvertimeType);
        }
        
        if (searchTerm) {
            queryParams.append('search', searchTerm);
        }
        
        if (dateRange.from) {
            queryParams.append('from_date', dateRange.from);
        }
        
        if (dateRange.to) {
            queryParams.append('to_date', dateRange.to);
        }
        
        // Generate the export URL with the current filters
        const exportUrl = `/overtimes/export?${queryParams.toString()}`;
        
        // Create a temporary link and click it
        const link = document.createElement('a');
        link.href = exportUrl;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Reset export state after a delay
        setTimeout(() => {
            setExporting(false);
        }, 2000);
    };

    const canSelectOvertime = (overtime) => {
        if (userRoles.isSuperAdmin) {
            // Superadmin can select any overtime that's pending or manager approved
            return overtime.status === 'pending' || overtime.status === 'manager_approved';
        } else if (userRoles.isDepartmentManager) {
            // Department managers can only select pending overtimes assigned to them
            return overtime.status === 'pending' && 
                   (overtime.dept_manager_id === userRoles.userId || 
                    userRoles.managedDepartments?.includes(overtime.employee?.Department));
        } else if (userRoles.isHrdManager) {
            // HRD managers can only select manager approved overtimes
            return overtime.status === 'manager_approved';
        }
        return false;
    };

    // Get selectable items count
    const selectableItemsCount = filteredOvertimes.filter(ot => canSelectOvertime(ot)).length;

    // Determine the approval level for bulk actions based on user role
    const bulkApprovalLevel = userRoles.isDepartmentManager ? 'department' : 'hrd';

    // Helper function for bulk action button content
    const bulkActionButtonContent = () => {
        if (localProcessing || processing) {
            return (
                <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Processing...
                </>
            );
        }
        return `Bulk Action (${selectedIds.length})`;
    };

    return (
        <div className="bg-white shadow-md rounded-lg overflow-hidden flex flex-col h-[62vh] relative">
            {/* Global loading overlay for the entire list */}
            {(processing || localProcessing) && (
                <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-40">
                    <div className="text-center">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-indigo-600" />
                        <p className="text-sm text-gray-600">
                            {processing ? 'Processing overtime requests...' : 'Updating data...'}
                        </p>
                    </div>
                </div>
            )}
            
            <div className="p-4 border-b">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
                    <h3 className="text-lg font-semibold">Overtime Requests</h3>
                    
                    <div className="flex flex-wrap gap-2 w-full md:w-auto">
                        {/* Export Button */}
                        <button
                            onClick={exportToExcel}
                            className="px-3 py-1 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                            title="Export to Excel"
                            disabled={exporting || processing || localProcessing}
                        >
                            {exporting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    Exporting...
                                </>
                            ) : (
                                <>
                                    <Download className="h-4 w-4 mr-1" />
                                    Export
                                </>
                            )}
                        </button>

                        {/* Force Approve Button - Only visible for SuperAdmin */}
                        {userRoles.isSuperAdmin && (
                            <ForceApproveButton 
                                selectedIds={selectedIds} 
                                disabled={processing || localProcessing}
                            />
                        )}
                        
                        {/* Bulk Action Button */}
                        {selectedIds.length > 0 && (
                            <button
                                onClick={handleOpenBulkActionModal}
                                className="px-3 py-1 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                disabled={processing || localProcessing}
                            >
                                {bulkActionButtonContent()}
                            </button>
                        )}
                        
                        {/* Status Filter */}
                        <div className="flex items-center">
                            <select
                                id="statusFilter"
                                className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                value={filterStatus}
                                onChange={handleStatusFilterChange}
                                disabled={processing || localProcessing}
                            >
                                <option value="">All Statuses</option>
                                <option value="pending">Pending</option>
                                <option value="manager_approved">Dept. Approved</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                            </select>
                        </div>
                        
                        {/* Overtime Type Filter */}
                        <div className="flex items-center">
                            <select
                                id="overtimeTypeFilter"
                                className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                value={filterOvertimeType}
                                onChange={handleOvertimeTypeFilterChange}
                                disabled={processing || localProcessing}
                            >
                                <option value="">All Types</option>
                                {Object.entries(overtimeTypes).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
                
                {/* Search and date filters */}
                <div className="mt-4 flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search by name, ID, department, or reason"
                            className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            value={searchTerm}
                            onChange={handleSearchChange}
                            disabled={processing || localProcessing}
                        />
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                        <div className="flex items-center">
                            <label htmlFor="fromDate" className="mr-2 text-sm font-medium text-gray-700">
                                From:
                            </label>
                            <input
                                id="fromDate"
                                type="date"
                                className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                value={dateRange.from}
                                onChange={(e) => handleDateRangeChange('from', e.target.value)}
                                disabled={processing || localProcessing}
                            />
                        </div>
                        
                        <div className="flex items-center">
                            <label htmlFor="toDate" className="mr-2 text-sm font-medium text-gray-700">
                                To:
                            </label>
                            <input
                                id="toDate"
                                type="date"
                                className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                value={dateRange.to}
                                onChange={(e) => handleDateRangeChange('to', e.target.value)}
                                disabled={processing || localProcessing}
                            />
                        </div>
                        
                        {/* Clear filters button */}
                        {(filterStatus || filterOvertimeType || searchTerm || dateRange.from || dateRange.to) && (
                            <button
                                onClick={clearFilters}
                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm flex items-center disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                title="Clear all filters"
                                disabled={processing || localProcessing}
                            >
                                <X className="h-4 w-4 mr-1" />
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="overflow-auto flex-grow">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr>
                            {selectableItemsCount > 0 && (
                                <th scope="col" className="px-4 py-3 w-10">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                        checked={selectAll && selectedIds.length === selectableItemsCount}
                                        onChange={toggleSelectAll}
                                        disabled={processing || localProcessing}
                                    />
                                </th>
                            )}
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Employee
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Date & Time
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Hours
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Type
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Rate
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Filed By
                            </th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredOvertimes.length === 0 ? (
                            <tr>
                                <td colSpan={selectableItemsCount > 0 ? "9" : "8"} className="px-6 py-4 text-center text-sm text-gray-500">
                                    {processing || localProcessing ? 'Loading overtime records...' : 'No overtime records found'}
                                </td>
                            </tr>
                        ) : (
                            filteredOvertimes.map(overtime => (
                                <tr 
                                    key={overtime.id} 
                                    className={getRowStyling(overtime)}
                                    onDoubleClick={(e) => handleRowDoubleClick(overtime, e)}
                                    title={
                                        isRateEdited(overtime) 
                                            ? `Rate edited on ${overtime.rate_edited_at ? new Date(overtime.rate_edited_at).toLocaleString() : 'Unknown date'}${overtime.rateEditor ? ` by ${overtime.rateEditor.name}` : ''}`
                                            : canEditRate(overtime) 
                                                ? 'Double-click to edit rate' 
                                                : ''
                                    }
                                >
                                    {selectableItemsCount > 0 && (
                                        <td className="px-4 py-4">
                                            {canSelectOvertime(overtime) && (
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                                    checked={selectedIds.includes(overtime.id)}
                                                    onChange={() => toggleSelectItem(overtime.id)}
                                                    disabled={processing || localProcessing || deletingId === overtime.id || updatingId === overtime.id}
                                                />
                                            )}
                                        </td>
                                    )}
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">
                                            {overtime.employee ? 
                                                `${overtime.employee.Lname}, ${overtime.employee.Fname}` : 
                                                'Unknown employee'}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {overtime.employee?.idno || 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">
                                            {overtime.date ? formatDate(overtime.date) : 'N/A'}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {overtime.start_time && overtime.end_time ? 
                                                `${formatTime(overtime.start_time)} - ${formatTime(overtime.end_time)}` : 
                                                'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {overtime.total_hours !== undefined ? 
                                            parseFloat(overtime.total_hours).toFixed(2) : 
                                            'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">
                                            {formatOvertimeDescription(overtime)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <span className={`text-sm ${isRateEdited(overtime) ? 'text-red-700 font-medium' : 'text-gray-900'}`}>
                                                {overtime.rate_multiplier ? `${overtime.rate_multiplier}x` : 'N/A'}
                                            </span>
                                            {isRateEdited(overtime) && (
                                                <div className="flex items-center ml-2">
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                        EDITED
                                                    </span>
                                                    <Edit3 className="h-3 w-3 text-red-500 ml-1" />
                                                </div>
                                            )}
                                            {!isRateEdited(overtime) && canEditRate(overtime) && (
                                                <Edit3 
                                                    className="h-3 w-3 text-blue-500 ml-1 opacity-60" 
                                                    title="Double-click to edit"
                                                />
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <OvertimeStatusBadge status={overtime.status} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {overtime.creator ? overtime.creator.name : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex items-center justify-end space-x-2">
                                            <button
                                                onClick={() => handleViewDetail(overtime)}
                                                className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                                                disabled={processing || localProcessing || updatingId === overtime.id}
                                            >
                                                View
                                            </button>
                                            
                                            {canEditRate(overtime) && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleEditRate(overtime);
                                                    }}
                                                    className="text-blue-600 hover:text-blue-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center"
                                                    disabled={processing || localProcessing || updatingId === overtime.id}
                                                    title="Edit Rate"
                                                >
                                                    <Edit3 className="h-3 w-3 mr-1" />
                                                    Rate
                                                </button>
                                            )}
                                            
                                            {(overtime.status === 'pending' && 
                                              (userRoles.isSuperAdmin || 
                                               overtime.created_by === userRoles.userId || 
                                               (userRoles.isDepartmentManager && 
                                                (overtime.dept_manager_id === userRoles.userId || 
                                                 userRoles.managedDepartments?.includes(overtime.employee?.Department))))) && (
                                                <button
                                                    onClick={() => handleDelete(overtime.id)}
                                                    className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors duration-200"
                                                    disabled={processing || localProcessing || deletingId === overtime.id}
                                                >
                                                    {deletingId === overtime.id ? (
                                                        <>
                                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                            Deleting...
                                                        </>
                                                    ) : (
                                                        'Delete'
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            {/* Footer with summary information */}
            <div className="px-4 py-3 bg-gray-50 border-t text-sm text-gray-600">
                <div className="flex justify-between items-center">
                    <div>
                        Showing {filteredOvertimes.length} of {localOvertimes.length} overtime requests
                        {selectedIds.length > 0 && (
                            <span className="ml-4 text-indigo-600 font-medium">
                                {selectedIds.length} selected
                            </span>
                        )}
                    </div>
                    
                    <div className="flex items-center space-x-4">
                        {/* Rate editing hint */}
                        <div className="flex items-center text-xs text-blue-600">
                            <Edit3 className="h-3 w-3 mr-1" />
                            <span>Double-click pending rows to edit rate</span>
                        </div>
                        
                        {/* Processing indicator */}
                        {(processing || localProcessing) && (
                            <div className="flex items-center text-indigo-600">
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                <span className="text-xs">
                                    {processing ? 'Processing...' : 'Updating...'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Detail Modal */}
            {showModal && selectedOvertime && (
                <OvertimeDetailModal
                    overtime={selectedOvertime}
                    onClose={handleCloseModal}
                    onStatusUpdate={handleStatusUpdate}
                    userRoles={userRoles}
                    viewOnly={processing || localProcessing} // Pass loading state as viewOnly
                    processing={updatingId === selectedOvertime.id}
                />
            )}

            {/* Rate Edit Modal */}
            {showRateEditModal && selectedOvertimeForRate && (
                <OvertimeRateEditModal
                    isOpen={showRateEditModal}
                    onClose={handleCloseRateEditModal}
                    overtime={selectedOvertimeForRate}
                    userRoles={userRoles}
                    processing={processing || localProcessing}
                />
            )}

            {/* Bulk Action Modal */}
            {showBulkActionModal && (
                <MultiBulkActionModal
                    selectedCount={selectedIds} 
                    onClose={handleCloseBulkActionModal}
                    onSubmit={handleBulkStatusUpdate}
                    approvalLevel={bulkApprovalLevel}
                    userRoles={userRoles}
                />
            )}
        </div>
    );
};

export default OvertimeList;