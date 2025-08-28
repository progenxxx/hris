// resources/js/Pages/TravelOrder/TravelOrderDetailModal.jsx
import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { 
    X, 
    MapPin, 
    Calendar, 
    Clock, 
    User, 
    Building, 
    Car, 
    DollarSign, 
    FileText, 
    CheckCircle, 
    XCircle, 
    Loader2,
    AlertTriangle,
    Info,
    Download,
    Paperclip
} from 'lucide-react';
import TravelOrderStatusBadge from './StatusBadge';

const TravelOrderDetailModal = ({ 
    travelOrder, 
    onClose, 
    onStatusUpdate, 
    userRoles = {},
    viewOnly = false,
    processing = false 
}) => {
    const [remarks, setRemarks] = useState('');
    const [localProcessing, setLocalProcessing] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    
    // Debug function for development
    const debugLog = (message, data = null) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[TravelOrderDetailModal] ${message}`, data);
        }
    };
    
    // Check if user can update status
    const canUpdateStatus = !viewOnly && 
        travelOrder.status === 'pending' && 
        (userRoles.isHrdManager || userRoles.isSuperAdmin);
    
    // Reset states when modal opens/closes or processing changes
    useEffect(() => {
        if (processing) {
            setLocalProcessing(true);
        }
    }, [processing]);
    
    useEffect(() => {
        // Reset local state when modal is closed
        if (!travelOrder) {
            setLocalProcessing(false);
            setShowConfirmation(false);
            setPendingAction(null);
            setRemarks('');
        }
    }, [travelOrder]);
    
    const handleStatusChange = (status) => {
        debugLog('Status change initiated', { status, localProcessing, processing });
        
        if (localProcessing || processing) {
            debugLog('Blocked: Already processing');
            return;
        }
        
        // Validation for rejection
        if (status === 'rejected' && !remarks.trim()) {
            alert('Please provide remarks for rejection');
            return;
        }
        
        // Validation for force approval
        if (status === 'force_approved' && !remarks.trim()) {
            alert('Please provide remarks for force approval');
            return;
        }
        
        // Show confirmation for important actions
        if (status === 'rejected' || status === 'cancelled' || status === 'force_approved') {
            debugLog('Showing confirmation for', status);
            setPendingAction(status);
            setShowConfirmation(true);
            return;
        }
        
        // Execute the status change directly for approve
        debugLog('Executing status change directly', status);
        executeStatusChange(status);
    };
    
    const executeStatusChange = (status) => {
        debugLog('Executing status change', { status, travelOrderId: travelOrder.id });
        
        setLocalProcessing(true);
        
        // Create data object with status and remarks
        const data = {
            status: status,
            remarks: remarks
        };
        
        // Call the onStatusUpdate with id and data
        if (typeof onStatusUpdate === 'function') {
            try {
                const result = onStatusUpdate(travelOrder.id, data);
                
                // Handle promise-based responses
                if (result && typeof result.then === 'function') {
                    result
                        .then(() => {
                            debugLog('Status update successful');
                            setLocalProcessing(false);
                            setShowConfirmation(false);
                            setPendingAction(null);
                            // Close modal AFTER successful update
                            if (typeof onClose === 'function') {
                                onClose();
                            }
                        })
                        .catch((error) => {
                            debugLog('Status update failed', error);
                            console.error('Error updating status:', error);
                            alert('Error: Unable to update status. Please try again.');
                            setLocalProcessing(false);
                            setShowConfirmation(false);
                            setPendingAction(null);
                            // Don't close modal on error - user might want to retry
                        });
                } else {
                    debugLog('Status update completed (non-promise result)');
                    setLocalProcessing(false);
                    setShowConfirmation(false);
                    setPendingAction(null);
                    // Close modal if non-promise result (assuming success)
                    if (typeof onClose === 'function') {
                        onClose();
                    }
                }
            } catch (error) {
                debugLog('Status update exception', error);
                console.error('Error updating status:', error);
                alert('Error: Unable to update status. Please try again.');
                setLocalProcessing(false);
                setShowConfirmation(false);
                setPendingAction(null);
                // Don't close modal on error
            }
        } else {
            console.error('onStatusUpdate is not a function');
            alert('Error: Unable to update status. Please refresh the page and try again.');
            setLocalProcessing(false);
            setShowConfirmation(false);
            setPendingAction(null);
        }
    };
    
    const handleConfirmAction = () => {
        if (pendingAction && !localProcessing) {
            debugLog('Confirming action', pendingAction);
            executeStatusChange(pendingAction);
        }
    };
    
    const handleCancelAction = () => {
        if (!localProcessing) {
            debugLog('Cancelling action');
            setShowConfirmation(false);
            setPendingAction(null);
        }
    };
    
    const handleCloseModal = () => {
        // Don't allow closing if currently processing
        if (localProcessing || processing) {
            debugLog('Cannot close modal while processing');
            return;
        }
        
        debugLog('Closing modal');
        if (typeof onClose === 'function') {
            onClose();
        }
    };
    
    // Format date safely
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            return format(parseISO(dateString), 'MMMM dd, yyyy');
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'Invalid date';
        }
    };
    
    // Format date for input fields
    const formatDateForInput = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            return format(parseISO(dateString), 'yyyy-MM-dd');
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'Invalid date';
        }
    };
    
    // Format time safely
    const formatTime = (timeString) => {
        if (!timeString) return 'N/A';
        
        try {
            let timeOnly;
            if (timeString.includes('T')) {
                const [, time] = timeString.split('T');
                timeOnly = time.slice(0, 5);
            } else {
                const timeParts = timeString.split(' ');
                timeOnly = timeParts[timeParts.length - 1].slice(0, 5);
            }
            
            const [hours, minutes] = timeOnly.split(':');
            const hourNum = parseInt(hours, 10);
            
            const ampm = hourNum >= 12 ? 'PM' : 'AM';
            const formattedHours = hourNum % 12 || 12;
            
            return `${formattedHours}:${minutes} ${ampm}`;
        } catch (error) {
            console.error('Time formatting error:', error);
            return 'N/A';
        }
    };
    
    // Format currency
    const formatCurrency = (amount) => {
        if (!amount) return '₱0.00';
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP'
        }).format(amount);
    };
    
    // Format file size
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    // Get file extension from filename
    const getFileExtension = (filename) => {
        return filename.split('.').pop().toLowerCase();
    };
    
    // Get file icon based on extension
    const getFileIcon = (filename) => {
        const ext = getFileExtension(filename);
        const iconClass = "h-5 w-5";
        
        switch (ext) {
            case 'pdf':
                return <FileText className={`${iconClass} text-red-500`} />;
            case 'doc':
            case 'docx':
                return <FileText className={`${iconClass} text-blue-500`} />;
            case 'jpg':
            case 'jpeg':
            case 'png':
                return <FileText className={`${iconClass} text-green-500`} />;
            default:
                return <FileText className={`${iconClass} text-gray-500`} />;
        }
    };
    
    // Parse document paths
    const getDocuments = () => {
        if (!travelOrder.document_paths) return [];
        
        try {
            // If it's already an array, return it
            if (Array.isArray(travelOrder.document_paths)) {
                return travelOrder.document_paths;
            }
            
            // If it's a JSON string, parse it
            if (typeof travelOrder.document_paths === 'string') {
                return JSON.parse(travelOrder.document_paths);
            }
            
            return [];
        } catch (error) {
            console.error('Error parsing document paths:', error);
            return [];
        }
    };
    
    // Handle document download with improved error handling
    const handleDocumentDownload = (index) => {
        try {
            debugLog('Document download initiated', { index, travelOrderId: travelOrder.id });
            
            // Check if route helper is available
            let downloadUrl;
            if (typeof route === 'function') {
                downloadUrl = route('travel-orders.download-document', {
                    id: travelOrder.id,
                    index: index
                });
            } else {
                // Fallback to manual URL construction
                downloadUrl = `/travel-orders/${travelOrder.id}/download-document/${index}`;
            }
            
            debugLog('Download URL generated', downloadUrl);
            
            // Create a temporary link element for download
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            
            // Append to body, click, and remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
        } catch (error) {
            console.error('Error downloading document:', error);
            alert('Error downloading document. Please try again.');
        }
    };
    
    // Get action button properties
    const getActionButtonProps = (status) => {
        switch (status) {
            case 'approved':
                return {
                    className: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
                    text: 'Approve',
                    icon: CheckCircle
                };
            case 'rejected':
                return {
                    className: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
                    text: 'Reject',
                    icon: XCircle
                };
            case 'completed':
                return {
                    className: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
                    text: 'Mark Completed',
                    icon: CheckCircle
                };
            case 'cancelled':
                return {
                    className: 'bg-gray-600 hover:bg-gray-700 focus:ring-gray-500',
                    text: 'Cancel',
                    icon: XCircle
                };
            case 'force_approved':
                return {
                    className: 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500',
                    text: 'Force Approve',
                    icon: CheckCircle
                };
            default:
                return {
                    className: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
                    text: 'Update',
                    icon: CheckCircle
                };
        }
    };
    
    const getConfirmationMessage = (action) => {
        switch (action) {
            case 'rejected':
                return 'Are you sure you want to reject this travel order? This action cannot be undone.';
            case 'cancelled':
                return 'Are you sure you want to cancel this travel order? This action cannot be undone.';
            case 'force_approved':
                return 'Are you sure you want to force approve this travel order? This will bypass normal approval workflow.';
            default:
                return 'Are you sure you want to proceed with this action?';
        }
    };

    const documents = getDocuments();

    if (!travelOrder) {
        return null;
    }

    return (
        <>
            <div className="fixed inset-0 z-50 overflow-y-auto">
                <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                    <div className="fixed inset-0 transition-opacity" aria-hidden="true">
                        <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                    </div>
                    
                    <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                    
                    <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full relative">
                        
                        {/* Processing Overlay */}
                        {(localProcessing || processing) && (
                            <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-20">
                                <div className="text-center">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-indigo-600" />
                                    <p className="text-sm text-gray-600">Updating travel order...</p>
                                </div>
                            </div>
                        )}
                        
                        <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            {/* Header */}
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 sm:mx-0 sm:h-10 sm:w-10">
                                        <MapPin className="h-6 w-6 text-indigo-600" />
                                    </div>
                                    <div className="ml-4">
                                        <h3 className="text-xl leading-6 font-medium text-gray-900">
                                            Travel Order #{travelOrder.id}
                                        </h3>
                                        <p className="text-sm text-gray-500">
                                            Filed on {travelOrder.created_at ? 
                                                format(parseISO(travelOrder.created_at), 'MMMM dd, yyyy h:mm a') 
                                                : 'N/A'}
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center space-x-2">
                                    <TravelOrderStatusBadge status={travelOrder.status} />
                                    <button
                                        onClick={handleCloseModal}
                                        className="text-gray-400 hover:text-gray-600 focus:outline-none"
                                        disabled={localProcessing || processing}
                                    >
                                        <X className="h-6 w-6" />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Employee Information */}
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                                        <User className="h-5 w-5 mr-2 text-gray-600" />
                                        Employee Information
                                    </h4>
                                    
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-3 gap-1">
                                            <span className="text-sm font-medium text-gray-500">Employee ID:</span>
                                            <span className="col-span-2 text-sm text-gray-900">
                                                {travelOrder.employee?.idno || 'N/A'}
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-3 gap-1">
                                            <span className="text-sm font-medium text-gray-500">Name:</span>
                                            <span className="col-span-2 text-sm text-gray-900">
                                                {travelOrder.employee ? 
                                                    `${travelOrder.employee.Lname}, ${travelOrder.employee.Fname} ${travelOrder.employee.MName || ''}` 
                                                    : 'N/A'}
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-3 gap-1">
                                            <span className="text-sm font-medium text-gray-500">Department:</span>
                                            <span className="col-span-2 text-sm text-gray-900 flex items-center">
                                                <Building className="h-4 w-4 mr-1 text-gray-400" />
                                                {travelOrder.employee?.Department || 'N/A'}
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-3 gap-1">
                                            <span className="text-sm font-medium text-gray-500">Position:</span>
                                            <span className="col-span-2 text-sm text-gray-900">
                                                {travelOrder.employee?.Jobtitle || 'N/A'}
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-3 gap-1">
                                            <span className="text-sm font-medium text-gray-500">Filed By:</span>
                                            <span className="col-span-2 text-sm text-gray-900">
                                                {travelOrder.creator?.name || 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Travel Details */}
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                                        <Calendar className="h-5 w-5 mr-2 text-gray-600" />
                                        Travel Details
                                    </h4>
                                    
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-3 gap-1">
                                            <span className="text-sm font-medium text-gray-500">Destination:</span>
                                            <span className="col-span-2 text-sm text-gray-900 flex items-center">
                                                <MapPin className="h-4 w-4 mr-1 text-gray-400" />
                                                {travelOrder.destination || 'N/A'}
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-3 gap-1">
                                            <span className="text-sm font-medium text-gray-500">Start Date:</span>
                                            <span className="col-span-2 text-sm text-gray-900">
                                                {formatDate(travelOrder.start_date)}
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-3 gap-1">
                                            <span className="text-sm font-medium text-gray-500">End Date:</span>
                                            <span className="col-span-2 text-sm text-gray-900">
                                                {formatDate(travelOrder.end_date)}
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-3 gap-1">
                                            <span className="text-sm font-medium text-gray-500">Duration:</span>
                                            <span className="col-span-2 text-sm text-gray-900">
                                                {travelOrder.total_days} day{travelOrder.total_days !== 1 ? 's' : ''} 
                                                <span className="text-gray-500 ml-1">
                                                    ({travelOrder.working_days} working day{travelOrder.working_days !== 1 ? 's' : ''})
                                                </span>
                                            </span>
                                        </div>
                                        
                                        {travelOrder.departure_time && (
                                            <div className="grid grid-cols-3 gap-1">
                                                <span className="text-sm font-medium text-gray-500">Departure:</span>
                                                <span className="col-span-2 text-sm text-gray-900 flex items-center">
                                                    <Clock className="h-4 w-4 mr-1 text-gray-400" />
                                                    {formatTime(travelOrder.departure_time)}
                                                </span>
                                            </div>
                                        )}
                                        
                                        {travelOrder.return_time && (
                                            <div className="grid grid-cols-3 gap-1">
                                                <span className="text-sm font-medium text-gray-500">Return:</span>
                                                <span className="col-span-2 text-sm text-gray-900 flex items-center">
                                                    <Clock className="h-4 w-4 mr-1 text-gray-400" />
                                                    {formatTime(travelOrder.return_time)}
                                                </span>
                                            </div>
                                        )}
                                        
                                        <div className="grid grid-cols-3 gap-1">
                                            <span className="text-sm font-medium text-gray-500">Transport:</span>
                                            <span className="col-span-2 text-sm text-gray-900 flex items-center">
                                                <Car className="h-4 w-4 mr-1 text-gray-400" />
                                                {travelOrder.transportation_type || 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Travel Type & Options */}
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                                        <Info className="h-5 w-5 mr-2 text-gray-600" />
                                        Travel Type & Options
                                    </h4>
                                    
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-gray-500">Travel Type:</span>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                travelOrder.is_full_day 
                                                    ? 'bg-blue-100 text-blue-800' 
                                                    : 'bg-yellow-100 text-yellow-800'
                                            }`}>
                                                {travelOrder.is_full_day ? 'Full Day' : 'Partial Day'}
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-gray-500">Return to Office:</span>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                travelOrder.return_to_office 
                                                    ? 'bg-green-100 text-green-800' 
                                                    : 'bg-gray-100 text-gray-800'
                                            }`}>
                                                {travelOrder.return_to_office ? 'Yes' : 'No'}
                                            </span>
                                        </div>
                                        
                                        {travelOrder.return_to_office && travelOrder.office_return_time && (
                                            <div className="grid grid-cols-3 gap-1">
                                                <span className="text-sm font-medium text-gray-500">Office Return:</span>
                                                <span className="col-span-2 text-sm text-gray-900 flex items-center">
                                                    <Clock className="h-3 w-3 mr-1 text-gray-400" />
                                                    {formatTime(travelOrder.office_return_time)}
                                                </span>
                                            </div>
                                        )}
                                        
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-gray-500">Accommodation:</span>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                travelOrder.accommodation_required 
                                                    ? 'bg-green-100 text-green-800' 
                                                    : 'bg-gray-100 text-gray-800'
                                            }`}>
                                                {travelOrder.accommodation_required ? 'Required' : 'Not Required'}
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-gray-500">Meal Allowance:</span>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                travelOrder.meal_allowance 
                                                    ? 'bg-green-100 text-green-800' 
                                                    : 'bg-gray-100 text-gray-800'
                                            }`}>
                                                {travelOrder.meal_allowance ? 'Included' : 'Not Included'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Financial Information */}
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                                        <DollarSign className="h-5 w-5 mr-2 text-gray-600" />
                                        Financial Information
                                    </h4>
                                    
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-3 gap-1">
                                            <span className="text-sm font-medium text-gray-500">Estimated Cost:</span>
                                            <span className="col-span-2 text-sm text-gray-900">
                                                {travelOrder.estimated_cost ? formatCurrency(travelOrder.estimated_cost) : 'Not specified'}
                                            </span>
                                        </div>
                                        
                                        {travelOrder.other_expenses && (
                                            <div>
                                                <span className="text-sm font-medium text-gray-500">Other Expenses:</span>
                                                <div className="mt-1 p-3 bg-white rounded border text-sm text-gray-900">
                                                    {travelOrder.other_expenses}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Purpose Section */}
                            <div className="mt-6">
                                <h4 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                                    <FileText className="h-5 w-5 mr-2 text-gray-600" />
                                    Purpose of Travel
                                </h4>
                                <div className="bg-gray-50 border rounded-lg p-4">
                                    <p className="text-sm text-gray-900 whitespace-pre-wrap">
                                        {travelOrder.purpose || 'No purpose provided'}
                                    </p>
                                </div>
                            </div>
                            
                            {/* Supporting Documents Section */}
                            {documents.length > 0 && (
                                <div className="mt-6">
                                    <h4 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
                                        <Paperclip className="h-5 w-5 mr-2 text-gray-600" />
                                        Supporting Documents ({documents.length})
                                    </h4>
                                    <div className="bg-gray-50 border rounded-lg p-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {documents.map((document, index) => {
                                                const filename = typeof document === 'string' ? 
                                                    document.split('/').pop() : 
                                                    `Document ${index + 1}`;
                                                
                                                return (
                                                    <div key={index} className="flex items-center justify-between bg-white p-3 rounded border hover:shadow-sm transition-shadow">
                                                        <div className="flex items-center flex-1 min-w-0">
                                                            {getFileIcon(filename)}
                                                            <div className="ml-3 flex-1 min-w-0">
                                                                <p className="text-sm font-medium text-gray-900 truncate" title={filename}>
                                                                    {filename}
                                                                </p>
                                                                <p className="text-xs text-gray-500">
                                                                    {getFileExtension(filename).toUpperCase()} Document
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleDocumentDownload(index)}
                                                            className="ml-3 flex-shrink-0 text-indigo-600 hover:text-indigo-800 focus:outline-none"
                                                            title="Download document"
                                                            disabled={localProcessing || processing}
                                                        >
                                                            <Download className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {/* Approval Information */}
                            {(travelOrder.approved_at || travelOrder.remarks) && (
                                <div className="mt-6">
                                    <h4 className="text-lg font-medium text-gray-900 mb-3">Approval Information</h4>
                                    <div className="bg-gray-50 border rounded-lg p-4 space-y-3">
                                        {travelOrder.approved_at && (
                                            <div>
                                                <span className="text-sm font-medium text-gray-500">
                                                    {travelOrder.status && travelOrder.status.charAt(0).toUpperCase() + travelOrder.status.slice(1)} on:
                                                </span>
                                                <span className="ml-2 text-sm text-gray-900">
                                                    {format(parseISO(travelOrder.approved_at), 'MMMM dd, yyyy h:mm a')}
                                                </span>
                                                {travelOrder.approver && (
                                                    <span className="ml-2 text-sm text-gray-500">
                                                        by {travelOrder.approver.name}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        
                                        {travelOrder.remarks && (
                                            <div>
                                                <span className="text-sm font-medium text-gray-500">Remarks:</span>
                                                <div className="mt-1 p-3 bg-white rounded border text-sm text-gray-900">
                                                    {travelOrder.remarks}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            
                            
                        </div>
                        
                        {/* Footer */}
                        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                            <button 
                                type="button" 
                                className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={handleCloseModal}
                                disabled={localProcessing || processing}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Confirmation Modal */}
            {showConfirmation && (
                <div className="fixed inset-0 z-60 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
                            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                        </div>
                        
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        
                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="sm:flex sm:items-start">
                                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                                        <AlertTriangle className="h-6 w-6 text-red-600" />
                                    </div>
                                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                                        <h3 className="text-lg leading-6 font-medium text-gray-900">
                                            Confirm Action
                                        </h3>
                                        <div className="mt-2">
                                            <p className="text-sm text-gray-500">
                                                {getConfirmationMessage(pendingAction)}
                                            </p>
                                            {pendingAction === 'rejected' && !remarks.trim() && (
                                                <p className="text-sm text-red-600 mt-2">
                                                    Please provide remarks before rejecting.
                                                </p>
                                            )}
                                            {pendingAction === 'force_approved' && !remarks.trim() && (
                                                <p className="text-sm text-red-600 mt-2">
                                                    Please provide remarks for force approval.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                <button
                                    type="button"
                                    className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 ${
                                        getActionButtonProps(pendingAction).className
                                    } text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed`}
                                    onClick={handleConfirmAction}
                                    disabled={
                                        localProcessing ||
                                        (pendingAction === 'rejected' && !remarks.trim()) ||
                                        (pendingAction === 'force_approved' && !remarks.trim())
                                    }
                                >
                                    {localProcessing ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        `Yes, ${getActionButtonProps(pendingAction).text}`
                                    )}
                                </button>
                                <button
                                    type="button"
                                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                                    onClick={handleCancelAction}
                                    disabled={localProcessing}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default TravelOrderDetailModal;