import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Head, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Sidebar from '@/Components/Sidebar';
import { Search, Calendar, Filter, Edit, RefreshCw, Clock, AlertTriangle, CheckCircle, Download, Trash2, X, Users, FileText, Eye, Moon, Sun, AlertCircle, CheckCircle2, Info, Calculator, Car, Upload, Calendar as CalendarIcon, Target, Send } from 'lucide-react';
import { Alert, AlertDescription } from '@/Components/ui/alert';
import { Button } from '@/Components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/card';
import AttendanceEditModal from './AttendanceEditModal';
import AttendanceInfoModal from './AttendanceInfoModal';

const ProcessedAttendanceList = () => {
  const { auth, attendances: initialAttendances = [], pagination = {}, recalculated_count = 0 } = usePage().props;
  const [attendances, setAttendances] = useState(initialAttendances);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [settingHoliday, setSettingHoliday] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [problemsOnlyFilter, setProblemsOnlyFilter] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(pagination.current_page || 1);
  const [totalPages, setTotalPages] = useState(pagination.last_page || 1);
  const [perPage, setPerPage] = useState(pagination.per_page || 25);
  
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [editsOnlyFilter, setEditsOnlyFilter] = useState(false);
  const [nightShiftFilter, setNightShiftFilter] = useState(false);
  const [postingStatusFilter, setPostingStatusFilter] = useState('');
  const [departments, setDepartments] = useState([]);
  const [holdTimer, setHoldTimer] = useState(null);
  const [isHolding, setIsHolding] = useState(false);

  //Detect DTR Problem
  const [detectingProblems, setDetectingProblems] = useState(false);
  const [showProblemsModal, setShowProblemsModal] = useState(false);
  const [problemRecords, setProblemRecords] = useState([]);
  const [problemSummary, setProblemSummary] = useState(null);
  
  // Modal state
  const [selectedAttendance, setSelectedAttendance] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  
  // Multi-select state
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  
  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMode, setDeleteMode] = useState('selected');
  const [deleteRange, setDeleteRange] = useState({
    start_date: '',
    end_date: '',
    employee_id: '',
    department: ''
  });
  const [deleting, setDeleting] = useState(false);

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);

  // Holiday modal state
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayData, setHolidayData] = useState({
    date: '',
    multiplier: '2.0',
    department: '',
    employee_ids: []
  });

  // POST modal state
  const [showPostModal, setShowPostModal] = useState(false);
  const [postData, setPostData] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    period_type: '1st_half',
    department: '',
    employee_ids: []
  });
  const [postPreview, setPostPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

const detectRecordProblems = useCallback((attendance) => {
    const problems = [];
    
    // Only check for problems if there's at least some time data present
    const hasAnyTimeData = attendance.time_in || attendance.time_out || 
                          attendance.break_in || attendance.break_out || 
                          attendance.next_day_timeout;
    
    // If there's no time data at all, consider it a valid "no work" record (good)
    if (!hasAnyTimeData) {
      return problems; // Return empty array - no problems
    }
    
    // Check for missing time in ONLY if there's other time data
    if (!attendance.time_in && hasAnyTimeData) {
      problems.push({
        type: 'missing_time_in',
        message: 'Missing Time In',
        severity: 'high',
        icon: 'clock'
      });
    }

    // Check for missing time out ONLY if there's time in or other time data
    if (attendance.time_in && !attendance.time_out && !(attendance.is_nightshift && attendance.next_day_timeout)) {
      problems.push({
        type: 'missing_time_out',
        message: 'Missing Time Out',
        severity: 'high',
        icon: 'clock'
      });
    }

    // Check for missing break times (only if there's work time)
    if (hasAnyTimeData && ((attendance.break_in && !attendance.break_out) || (!attendance.break_in && attendance.break_out))) {
      problems.push({
        type: 'missing_break_times',
        message: 'Incomplete Break Times',
        severity: 'medium',
        icon: 'coffee'
      });
    }

    // Check for excessive hours (more than 16 hours)
    if (attendance.hours_worked && attendance.hours_worked > 16) {
      problems.push({
        type: 'excessive_hours',
        message: `Excessive Hours: ${attendance.hours_worked}h`,
        severity: 'high',
        icon: 'alert-triangle'
      });
    }

    // Check for negative hours
    if (attendance.hours_worked && attendance.hours_worked < 0) {
      problems.push({
        type: 'negative_hours',
        message: `Negative Hours: ${attendance.hours_worked}h`,
        severity: 'high',
        icon: 'alert-triangle'
      });
    }

    // Check for night shift issues (only if it's marked as night shift)
    if (attendance.is_nightshift && attendance.time_in && !attendance.next_day_timeout) {
      problems.push({
        type: 'night_shift_issues',
        message: 'Night Shift Missing Next Day Timeout',
        severity: 'medium',
        icon: 'moon'
      });
    }

    // Check for weekend attendance without proper markers (only if there's work time)
    if (hasAnyTimeData && attendance.attendance_date) {
      try {
        const date = new Date(attendance.attendance_date);
        const dayOfWeek = date.getDay();
        if ((dayOfWeek === 0 || dayOfWeek === 6) && !attendance.restday && !attendance.overtime) {
          problems.push({
            type: 'weekend_attendance',
            message: 'Weekend Work Without OT/Rest Day Marker',
            severity: 'low',
            icon: 'calendar'
          });
        }
      } catch (e) {
        // Ignore date parsing errors
      }
    }

    return problems;
  }, []);

  // Better double-click prevention using useRef instead of state
  const editClickTimeoutRef = useRef(null);
  const isEditingRef = useRef(false);

  // Process attendance data for display
  const processAttendanceData = useCallback((data) => {
    return data.map(attendance => {
      const processedAttendance = {
        ...attendance,
        // Ensure all necessary fields are present
        employee_name: attendance.employee_name || 'Unknown Employee',
        idno: attendance.idno || 'N/A',
        department: attendance.department || 'N/A',
        line: attendance.line || 'N/A',
        hours_worked: attendance.hours_worked || 0,
        late_minutes: attendance.late_minutes || 0,
        undertime_minutes: attendance.undertime_minutes || 0,
        overtime: attendance.overtime || 0,
        travel_order: attendance.travel_order || 0,
        slvl: attendance.slvl || 0,
        trip: attendance.trip || 0,
        ct: attendance.ct || false,
        cs: attendance.cs || false,
        holiday: attendance.holiday || 0,
        ot_reg_holiday: attendance.ot_reg_holiday || 0,
        ot_special_holiday: attendance.ot_special_holiday || 0,
        retromultiplier: attendance.retromultiplier || 0,
        restday: attendance.restday || false,
        offset: attendance.offset || 0,
        ob: attendance.ob || false,
        is_nightshift: attendance.is_nightshift || false,
        source: attendance.source || 'unknown',
        posting_status: attendance.posting_status || 'not_posted'
      };

      // Add problems detection
      processedAttendance.problems = detectRecordProblems(processedAttendance);
      processedAttendance.hasProblems = processedAttendance.problems.length > 0;

      return processedAttendance;
    });
  }, [detectRecordProblems]);

  // Load attendance data with recalculation
  const loadAttendanceData = useCallback(async (showRecalcMessage = false) => {
    setLoading(true);
    setError('');
    
    try {
      const params = new URLSearchParams();
      params.append('page', currentPage);
      params.append('per_page', perPage);
      
      if (searchTerm) params.append('search', searchTerm);
      if (dateFilter) params.append('date', dateFilter);
      if (departmentFilter) params.append('department', departmentFilter);
      if (editsOnlyFilter) params.append('edits_only', 'true');
      if (nightShiftFilter) params.append('night_shift_only', 'true');
      if (postingStatusFilter) params.append('posting_status', postingStatusFilter);
      if (problemsOnlyFilter) params.append('problems_only', 'true');
      
      const response = await fetch('/attendance/list?' + params.toString(), {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        let processedData = processAttendanceData(data.data);
        
        // Apply problems filter on frontend since it's complex to do in SQL
        if (problemsOnlyFilter) {
          processedData = processedData.filter(attendance => {
            const problems = detectRecordProblems(attendance);
            return problems && problems.length > 0;
          });
        }
        
        setAttendances(processedData);
        setTotalPages(data.pagination.last_page);
        setCurrentPage(data.pagination.current_page);
        
        if (showRecalcMessage && data.recalculated_count > 0) {
          setSuccess(`Loaded data and recalculated ${data.recalculated_count} attendance records`);
        }
        
        setSelectedIds([]);
        setSelectAll(false);
      } else {
        setError('Failed to load attendance data');
      }
    } catch (err) {
      console.error('Error loading attendance data:', err);
      setError('Error loading attendance data: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [currentPage, perPage, searchTerm, dateFilter, departmentFilter, editsOnlyFilter, nightShiftFilter, postingStatusFilter, problemsOnlyFilter, processAttendanceData, detectRecordProblems]);

  // Load preview for posting
  const loadPostPreview = async () => {
    if (!postData.year || !postData.month || !postData.period_type) {
      return;
    }

    setLoadingPreview(true);
    setError('');

    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      const response = await fetch('/attendance/posting-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          year: postData.year,
          month: postData.month,
          period_type: postData.period_type,
          department: postData.department || null,
          employee_ids: postData.employee_ids.length > 0 ? postData.employee_ids : null
        })
      });

      if (!response.ok) {
        throw new Error(`Preview failed with status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setPostPreview(data);
      } else {
        setError('Failed to load posting preview: ' + (data.message || 'Unknown error'));
      }

    } catch (err) {
      console.error('Error loading post preview:', err);
      setError('Failed to load posting preview: ' + (err.message || 'Unknown error'));
    } finally {
      setLoadingPreview(false);
    }
  };

  // Handle POST to payroll
  const handlePostToPayroll = async () => {
  if (!postPreview || postPreview.totals.employees === 0) {
    setError('No employees to post');
    return;
  }

  setPosting(true);
  setError('');

  try {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    
    if (!csrfToken) {
      setError('Session expired. Please refresh the page and try again.');
      setPosting(false);
      return;
    }

    // Prepare the request payload with proper validation
    const requestData = {
      year: parseInt(postData.year),
      month: parseInt(postData.month),
      period_type: postData.period_type,
      department: postData.department || null,
      employee_ids: Array.isArray(postData.employee_ids) && postData.employee_ids.length > 0 
        ? postData.employee_ids.map(id => parseInt(id))
        : [] // Send empty array instead of null
    };

    // Validate required fields before sending
    if (!requestData.year || !requestData.month || !requestData.period_type) {
      setError('Year, Month, and Period Type are required for posting');
      setPosting(false);
      return;
    }

    console.log('Sending POST to payroll request:', requestData);
    
    const response = await fetch('/attendance/post-to-payroll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    // Enhanced error handling for different response codes
    if (!response.ok) {
      let errorMessage = `Posting failed with status: ${response.status}`;
      
      try {
        const errorData = await response.json();
        console.error('Response error data:', errorData);
        
        if (response.status === 422) {
          // Validation errors
          if (errorData.errors) {
            const errorMessages = Object.values(errorData.errors).flat();
            errorMessage = 'Validation failed: ' + errorMessages.join(', ');
          } else {
            errorMessage = 'Validation failed: ' + (errorData.message || 'Invalid data provided');
          }
        } else if (response.status === 404) {
          errorMessage = errorData.message || 'No eligible attendance records found for the specified criteria';
        } else if (response.status >= 500) {
          errorMessage = 'Server error occurred. Please try again later.';
        } else {
          errorMessage = errorData.message || errorMessage;
        }
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        errorMessage = `Request failed with status ${response.status}. Please check the server logs.`;
      }
      
      setError(errorMessage);
      setPosting(false);
      return;
    }

    const data = await response.json();
    console.log('POST response data:', data);

    if (data.success) {
      setSuccess(data.message || 'Posted to payroll successfully');
      setShowPostModal(false);
      setPostPreview(null);
      
      // Reset post form
      setPostData({
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        period_type: '1st_half',
        department: '',
        employee_ids: []
      });
      
      // Reload attendance data
      await loadAttendanceData(false);
    } else {
      setError('Posting failed: ' + (data.message || 'Unknown error occurred'));
      if (data.errors && data.errors.length > 0) {
        setError(data.message + '\n\nErrors:\n' + data.errors.slice(0, 3).join('\n'));
      }
    }

  } catch (err) {
    console.error('Posting error:', err);
    
    // Handle different types of errors
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      setError('Network error. Please check your internet connection and try again.');
    } else if (err.message.includes('JSON')) {
      setError('Invalid response from server. Please try again.');
    } else {
      setError('Failed to post to payroll: ' + (err.message || 'Unknown error occurred'));
    }
  } finally {
    setPosting(false);
  }
};

  // Apply filters and reload data
  const applyFilters = async () => {
  setCurrentPage(1);
  await loadAttendanceData(true);
};

  // Enhanced reset filters with auto-recalculation
  const resetFilters = async () => {
    setSearchTerm('');
    setDateFilter('');
    setDepartmentFilter('');
    setEditsOnlyFilter(false);
    setNightShiftFilter(false);
    setPostingStatusFilter('');
    setCurrentPage(1);
    
    setTimeout(async () => {
      await loadAttendanceData(true);
    }, 0);
  };


const renderProblemIndicator = useCallback((attendance) => {
    const problems = detectRecordProblems(attendance);
    
    if (problems.length === 0) {
      return (
        <div className="flex items-center justify-center">
          <CheckCircle className="h-4 w-4 text-green-500" title="No problems detected" />
        </div>
      );
    }

    const highSeverityProblems = problems.filter(p => p.severity === 'high');
    const mediumSeverityProblems = problems.filter(p => p.severity === 'medium');
    const lowSeverityProblems = problems.filter(p => p.severity === 'low');

    const getSeverityColor = () => {
      if (highSeverityProblems.length > 0) return 'text-red-500 bg-red-50 border-red-200';
      if (mediumSeverityProblems.length > 0) return 'text-orange-500 bg-orange-50 border-orange-200';
      return 'text-yellow-500 bg-yellow-50 border-yellow-200';
    };

    const getSeverityLabel = () => {
      if (highSeverityProblems.length > 0) return 'HIGH';
      if (mediumSeverityProblems.length > 0) return 'MED';
      return 'LOW';
    };

    return (
      <div className="flex flex-col items-center space-y-1">
        <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${getSeverityColor()}`}>
          <AlertTriangle className="h-4 w-4" />
        </div>
        <span className={`text-xs font-medium px-1 py-0.5 rounded ${getSeverityColor()}`}>
          {getSeverityLabel()}
        </span>
        <span className="text-xs text-gray-500">
          {problems.length} issue{problems.length > 1 ? 's' : ''}
        </span>
      </div>
    );
  }, [detectRecordProblems]);


const renderProblemsTooltip = useCallback((attendance) => {
    const problems = detectRecordProblems(attendance);
    
    if (problems.length === 0) return null;

    return (
      <div className="absolute z-50 w-80 p-3 bg-white border border-gray-200 rounded-lg shadow-lg top-full left-0 mt-1">
        <div className="space-y-2">
          <h4 className="font-medium text-gray-900 flex items-center">
            <AlertTriangle className="h-4 w-4 mr-1 text-red-500" />
            DTR Problems Detected
          </h4>
          {problems.map((problem, index) => (
            <div key={index} className={`flex items-start space-x-2 p-2 rounded text-sm ${
              problem.severity === 'high' ? 'bg-red-50 text-red-800' :
              problem.severity === 'medium' ? 'bg-orange-50 text-orange-800' :
              'bg-yellow-50 text-yellow-800'
            }`}>
              <div className={`w-2 h-2 rounded-full mt-1.5 ${
                problem.severity === 'high' ? 'bg-red-500' :
                problem.severity === 'medium' ? 'bg-orange-500' :
                'bg-yellow-500'
              }`}></div>
              <span>{problem.message}</span>
            </div>
          ))}
          <div className="pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              💡 Double-click this row to edit and fix these issues
            </p>
          </div>
        </div>
      </div>
    );
  }, [detectRecordProblems]);

  // Handle download template functionality
  const handleDownloadTemplate = async () => {
    setExporting(true);
    setError('');
    
    try {
      const params = new URLSearchParams();
      
      // Add current filters to download
      if (searchTerm) params.append('search', searchTerm);
      if (dateFilter) params.append('date', dateFilter);
      if (departmentFilter) params.append('department', departmentFilter);
      if (editsOnlyFilter) params.append('edits_only', 'true');
      if (nightShiftFilter) params.append('night_shift_only', 'true');
      if (postingStatusFilter) params.append('posting_status', postingStatusFilter);
      
      const response = await fetch('/processattendance/download-template?' + params.toString(), {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/octet-stream'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Download failed with status: ${response.status}`);
      }
      
      // Get the blob data
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with current date and filters
      const now = new Date();
      const dateString = now.toISOString().split('T')[0];
      let filename = `attendance_data_${dateString}`;
      
      // Add filter info to filename
      if (dateFilter) {
        filename += `_${dateFilter}`;
      }
      if (departmentFilter) {
        filename += `_${departmentFilter.replace(/\s+/g, '_')}`;
      }
      if (editsOnlyFilter) {
        filename += '_edited_only';
      }
      if (nightShiftFilter) {
        filename += '_night_shift';
      }
      
      link.download = `${filename}.csv`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setSuccess('Attendance data downloaded successfully');
      
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to download attendance data: ' + (err.message || 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  // Add this function with your other handlers
const handleDetectDtrProblems = async () => {
  if (detectingProblems) return;
  
  setDetectingProblems(true);
  setError('');
  
  try {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    
    if (!csrfToken) {
      setError('Session expired. Please refresh the page and try again.');
      setDetectingProblems(false);
      return;
    }
    
    // Use current filters for problem detection
    const requestData = {
      date: dateFilter || null,
      department: departmentFilter || null,
      employee_ids: selectedIds.length > 0 ? selectedIds : null
    };
    
    console.log('Detecting DTR problems with filters:', requestData);
    
    const response = await fetch('/attendance/detect-dtr-problems', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      let errorMessage = `DTR problem detection failed with status: ${response.status}`;
      
      try {
        const errorData = await response.json();
        console.error('DTR detection error response:', errorData);
        
        if (response.status === 422) {
          if (errorData.errors) {
            const errorMessages = Object.values(errorData.errors).flat();
            errorMessage = 'Validation failed: ' + errorMessages.join(', ');
          } else {
            errorMessage = 'Validation failed: ' + (errorData.message || 'Invalid data provided');
          }
        } else if (response.status >= 500) {
          errorMessage = 'Server error during DTR problem detection. Please check the server logs.';
        } else {
          errorMessage = errorData.message || errorMessage;
        }
      } catch (parseError) {
        console.error('Error parsing DTR detection response:', parseError);
        errorMessage = `DTR problem detection failed with status ${response.status}. Please check the server logs.`;
      }
      
      setError(errorMessage);
      setDetectingProblems(false);
      return;
    }
    
    const data = await response.json();
    console.log('DTR problem detection response:', data);
    
    if (data.success) {
      setProblemRecords(data.data);
      setProblemSummary(data.summary);
      setShowProblemsModal(true);
      
      if (data.summary.problem_records === 0) {
        setSuccess('Great! No DTR problems detected in the current view.');
      } else {
        setSuccess(`DTR analysis complete: Found ${data.summary.problem_records} records with problems`);
      }
    } else {
      setError('DTR problem detection failed: ' + (data.message || 'Unknown error occurred'));
    }
    
  } catch (err) {
    console.error('DTR problem detection error:', err);
    
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      setError('Network error. Please check your internet connection and try again.');
    } else if (err.message.includes('JSON')) {
      setError('Invalid response from server. Please try again.');
    } else {
      setError('Failed to detect DTR problems: ' + (err.message || 'Unknown error occurred'));
    }
  } finally {
    setDetectingProblems(false);
  }
};

  // Handle export functionality
  const handleExport = async () => {
    setExporting(true);
    setError('');
    
    try {
      const params = new URLSearchParams();
      
      // Add current filters to export
      if (searchTerm) params.append('search', searchTerm);
      if (dateFilter) params.append('date', dateFilter);
      if (departmentFilter) params.append('department', departmentFilter);
      if (editsOnlyFilter) params.append('edits_only', 'true');
      if (nightShiftFilter) params.append('night_shift_only', 'true');
      if (postingStatusFilter) params.append('posting_status', postingStatusFilter);
      
      const response = await fetch('/attendance/export?' + params.toString(), {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/octet-stream'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Export failed with status: ${response.status}`);
      }
      
      // Get the blob data
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with current date and filters
      const now = new Date();
      const dateString = now.toISOString().split('T')[0];
      let filename = `attendance_export_${dateString}`;
      
      // Add filter info to filename
      if (dateFilter) {
        filename += `_${dateFilter}`;
      }
      if (departmentFilter) {
        filename += `_${departmentFilter.replace(/\s+/g, '_')}`;
      }
      if (editsOnlyFilter) {
        filename += '_edited_only';
      }
      if (nightShiftFilter) {
        filename += '_night_shift';
      }
      
      link.download = `${filename}.csv`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setSuccess('Attendance data exported successfully');
      
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export attendance data: ' + (err.message || 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  // Handle import functionality
  const handleImport = async () => {
    if (!importFile) {
      setError('Please select a file to import');
      return;
    }

    setImporting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

      const response = await fetch('/processattendance/import', {
        method: 'POST',
        headers: {
          'X-CSRF-TOKEN': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Import failed with status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setSuccess(data.message || 'Import completed successfully');
        setShowImportModal(false);
        setImportFile(null);
        await loadAttendanceData(false);
      } else {
        setError('Import failed: ' + (data.message || 'Unknown error'));
        if (data.errors && data.errors.length > 0) {
          setError(data.message + '\n\nErrors:\n' + data.errors.slice(0, 5).join('\n'));
        }
      }

    } catch (err) {
      console.error('Import error:', err);
      setError('Failed to import attendance data: ' + (err.message || 'Unknown error'));
    } finally {
      setImporting(false);
    }
  };

  const handleSetHoliday = async () => {
    // Enhanced validation
    if (!holidayData.date) {
      setError('Please select a holiday date');
      return;
    }
    
    if (!holidayData.multiplier || isNaN(parseFloat(holidayData.multiplier))) {
      setError('Please provide a valid holiday multiplier');
      return;
    }

    const multiplierValue = parseFloat(holidayData.multiplier);
    if (multiplierValue < 0.1 || multiplierValue > 10) {
      setError('Holiday multiplier must be between 0.1 and 10');
      return;
    }

    setSettingHoliday(true);
    setError('');

    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      if (!csrfToken) {
        setError('Session expired. Please refresh the page and try again.');
        setSettingHoliday(false);
        return;
      }

      // Prepare the request payload with proper array handling
      const requestData = {
        date: holidayData.date,
        multiplier: multiplierValue,
        department: holidayData.department || null,
        employee_ids: Array.isArray(holidayData.employee_ids) && holidayData.employee_ids.length > 0 
          ? holidayData.employee_ids 
          : []  // Send empty array instead of null
      };

      console.log('Sending holiday request:', requestData);

      const response = await fetch('/attendance/set-holiday', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        if (response.status === 422) {
          const errorData = await response.json();
          if (errorData.errors) {
            const errorMessages = Object.values(errorData.errors).flat();
            setError('Validation failed: ' + errorMessages.join(', '));
          } else {
            setError('Validation failed: ' + (errorData.message || 'Invalid data provided'));
          }
          return;
        } else if (response.status === 404) {
          const errorData = await response.json();
          setError(errorData.message || 'No eligible attendance records found for the specified criteria');
          return;
        } else if (response.status >= 500) {
          setError('Server error occurred. Please try again later.');
          return;
        } else {
          throw new Error(`Request failed with status: ${response.status}`);
        }
      }

      const data = await response.json();

      if (data.success) {
        setSuccess(data.message || 'Holiday set successfully');
        setShowHolidayModal(false);
        
        // Reset holiday form data
        setHolidayData({
          date: '',
          multiplier: '2.0',
          department: '',
          employee_ids: []
        });
        
        // Reload attendance data
        await loadAttendanceData(false);
      } else {
        setError('Set holiday failed: ' + (data.message || 'Unknown error occurred'));
      }

    } catch (err) {
      console.error('Set holiday error:', err);
      
      // Handle different types of errors
      if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        setError('Network error. Please check your internet connection and try again.');
      } else if (err.message.includes('JSON')) {
        setError('Invalid response from server. Please try again.');
      } else {
        setError('Failed to set holiday: ' + (err.message || 'Unknown error occurred'));
      }
    } finally {
      setSettingHoliday(false);
    }
  };

  // Handle auto-recalculation
  // Handle auto-recalculation - FIXED VERSION
const handleAutoRecalculate = async (showMessage = false) => {
  if (recalculating) return;
  
  setRecalculating(true);
  setError('');
  
  try {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    
    if (!csrfToken) {
      setError('Session expired. Please refresh the page and try again.');
      setRecalculating(false);
      return;
    }
    
    // Prepare request payload - FIXED: Ensure proper data types
    const requestData = {
      date: dateFilter || null,
      department: departmentFilter || null
    };
    
    console.log('Sending recalculation request:', requestData);
    
    const response = await fetch('/attendance/recalculate-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    // Enhanced error handling
    if (!response.ok) {
      let errorMessage = `Recalculation failed with status: ${response.status}`;
      
      try {
        const errorData = await response.json();
        console.error('Recalculation error response:', errorData);
        
        if (response.status === 422) {
          // Validation errors
          if (errorData.errors) {
            const errorMessages = Object.values(errorData.errors).flat();
            errorMessage = 'Validation failed: ' + errorMessages.join(', ');
          } else {
            errorMessage = 'Validation failed: ' + (errorData.message || 'Invalid data provided');
          }
        } else if (response.status >= 500) {
          errorMessage = 'Server error during recalculation. Please check the server logs.';
        } else {
          errorMessage = errorData.message || errorMessage;
        }
      } catch (parseError) {
        console.error('Error parsing recalculation response:', parseError);
        errorMessage = `Recalculation failed with status ${response.status}. Please check the server logs.`;
      }
      
      setError(errorMessage);
      setRecalculating(false);
      return;
    }
    
    const data = await response.json();
    console.log('Recalculation response:', data);
    
    if (data.success) {
      if (showMessage && data.recalculated_count > 0) {
        setSuccess(`Recalculated ${data.recalculated_count} attendance records`);
      } else if (showMessage) {
        setSuccess('Recalculation completed - all records are up to date');
      }
      
      // Reload data after successful recalculation
      await loadAttendanceData(false);
    } else {
      setError('Recalculation failed: ' + (data.message || 'Unknown error occurred'));
    }
    
  } catch (err) {
    console.error('Recalculation error:', err);
    
    // Handle different types of errors
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      setError('Network error. Please check your internet connection and try again.');
    } else if (err.message.includes('JSON')) {
      setError('Invalid response from server. Please try again.');
    } else {
      setError('Failed to recalculate attendance data: ' + (err.message || 'Unknown error occurred'));
    }
  } finally {
    setRecalculating(false);
  }
};

  // Handle sync functionality
  const handleSync = async () => {
    if (syncing) return;
    
    setSyncing(true);
    setError('');
    
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      const response = await fetch('/attendance/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Sync failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess(data.message || 'Sync completed successfully');
        await loadAttendanceData(false);
      } else {
        setError('Sync failed: ' + (data.message || 'Unknown error'));
      }
      
    } catch (err) {
      console.error('Sync error:', err);
      setError('Failed to sync attendance data: ' + (err.message || 'Unknown error'));
    } finally {
      setSyncing(false);
    }
  };

  // Handle individual record sync
  const handleIndividualSync = async (attendanceId) => {
    try {
      setError('');
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      const response = await fetch(`/attendance/${attendanceId}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Individual sync failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess(data.message || 'Record synced successfully');
        
        if (data.data) {
          setAttendances(prevAttendances => 
            prevAttendances.map(att => 
              att.id === attendanceId ? { ...att, ...data.data } : att
            )
          );
        }
      } else {
        setError('Individual sync failed: ' + (data.message || 'Unknown error'));
      }
      
    } catch (err) {
      console.error('Individual sync error:', err);
      setError('Failed to sync individual record: ' + (err.message || 'Unknown error'));
    }
  };

  // Handle attendance update
  const handleAttendanceUpdate = async (updatedAttendance) => {
    try {
      setError('');
      setSuccess('');
      
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      if (!csrfToken) {
        setError('Session expired. Please refresh the page and try again.');
        return;
      }
      
      const timeUpdatePayload = {
        id: updatedAttendance.id,
        time_in: updatedAttendance.time_in,
        break_in: updatedAttendance.break_in,
        break_out: updatedAttendance.break_out,
        time_out: updatedAttendance.time_out,
        next_day_timeout: updatedAttendance.next_day_timeout,
        is_nightshift: updatedAttendance.is_nightshift,
        trip: updatedAttendance.trip
      };
      
      console.log('Sending payload:', timeUpdatePayload); // Debug log
      
      const response = await fetch(`/attendance/${updatedAttendance.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        },
        body: JSON.stringify(timeUpdatePayload)
      });
      
      console.log('Response status:', response.status); // Debug log
      console.log('Response headers:', Object.fromEntries(response.headers.entries())); // Debug log
      
      // Handle specific status codes
      if (response.status === 401) {
        setError('Session expired. Please refresh the page and login again.');
        return;
      }
      
      if (response.status === 419) {
        setError('Security token expired. Please refresh the page and try again.');
        return;
      }
      
      if (response.status === 422) {
        // Validation errors
        try {
          const errorData = await response.json();
          const errorMessage = errorData.message || 'Validation failed';
          setError(errorMessage);
          return;
        } catch (parseError) {
          setError('Validation failed. Please check your input and try again.');
          return;
        }
      }
      
      // Check content type before parsing
      const contentType = response.headers.get('content-type');
      console.log('Content-Type:', contentType); // Debug log
      
      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = `HTTP error! status: ${response.status}`;
        
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch (parseError) {
            console.warn('Could not parse error response as JSON:', parseError);
          }
        } else {
          // Non-JSON error response, try to get text
          try {
            const errorText = await response.text();
            console.log('Error response text:', errorText.substring(0, 500)); // Log first 500 chars
            errorMessage = 'Server error occurred. Please try again.';
          } catch (textError) {
            console.warn('Could not get error response text:', textError);
          }
        }
        
        setError(errorMessage);
        return;
      }
      
      // Handle successful response
      if (!contentType || !contentType.includes('application/json')) {
        console.warn('Success response is not JSON:', contentType);
        setSuccess('Update completed successfully!');
        // Optional: reload to refresh data
        setTimeout(() => {
          window.location.reload();
        }, 1500);
        return;
      }
      
      // Parse JSON response
      let data;
      try {
        const responseText = await response.text();
        console.log('Response text:', responseText); // Debug log
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Response text that failed to parse:', await response.text());
        setSuccess('Update completed successfully!');
        setTimeout(() => {
          window.location.reload();
        }, 1500);
        return;
      }
      
      if (data.success) {
        setSuccess('Attendance record updated successfully');
        
        const processedRecord = {
          ...data.data,
          source: 'manual_edit',
          is_edited: true
        };
        
        setAttendances(prevAttendances => 
          prevAttendances.map(att => 
            att.id === updatedAttendance.id ? processedRecord : att
          )
        );
        
        setShowEditModal(false);
      } else {
        if (data.redirect) {
          setError('Session expired. Redirecting to login...');
          setTimeout(() => {
            window.location.href = data.redirect;
          }, 2000);
        } else {
          setError('Failed to update attendance: ' + (data.message || 'Unknown error'));
        }
      }
    } catch (err) {
      console.error('Error updating attendance:', err);
      
      if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        setError('Network error. Please check your internet connection and try again.');
      } else if (err.name === 'SyntaxError' && err.message.includes('JSON')) {
        console.error('JSON parsing failed - likely receiving HTML instead of JSON');
        setSuccess('Update may have completed. Please refresh the page to see changes.');
      } else if (err.message.includes('HTTP error')) {
        setError(`Server error (${err.message}). Please try again or contact support.`);
      } else {
        setError('Error updating attendance: ' + (err.message || 'Unknown error'));
      }
    }
  };

  // Handle checkbox selection
  const handleCheckboxChange = (e, attendanceId) => {
    e.stopPropagation();
    
    if (e.target.checked) {
      setSelectedIds(prev => [...prev, attendanceId]);
    } else {
      setSelectedIds(prev => prev.filter(id => id !== attendanceId));
    }
  };

  // Handle select all checkbox
  const handleSelectAll = (checked) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedIds(attendances.map(att => att.id));
    } else {
      setSelectedIds([]);
    }
  };

  // Handle mouse interactions for hold-to-view functionality
  const handleMouseDown = (e, attendance) => {
    e.preventDefault();
    
    setIsHolding(true);
    
    const timer = setTimeout(() => {
      setSelectedAttendance(attendance);
      setShowInfoModal(true);
      setIsHolding(false);
    }, 1000);
    
    setHoldTimer(timer);
  };

  const handleMouseUp = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      setHoldTimer(null);
    }
    setIsHolding(false);
  };

  const handleMouseLeave = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      setHoldTimer(null);
    }
    setIsHolding(false);
  };

  // Handle row double-click for editing
  const handleRowDoubleClick = (e, attendance) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (holdTimer) {
      clearTimeout(holdTimer);
      setHoldTimer(null);
    }
    
    if (isEditingRef.current) return;
    
    if (editClickTimeoutRef.current) {
      clearTimeout(editClickTimeoutRef.current);
    }
    
    isEditingRef.current = true;
    
    setSelectedAttendance(attendance);
    setShowEditModal(true);
    
    editClickTimeoutRef.current = setTimeout(() => {
      isEditingRef.current = false;
    }, 500);
  };

  // Handle edit button click
  const handleEditClick = (e, attendance) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isEditingRef.current) return;
    
    if (editClickTimeoutRef.current) {
      clearTimeout(editClickTimeoutRef.current);
    }
    
    isEditingRef.current = true;
    
    setSelectedAttendance(attendance);
    setShowEditModal(true);
    
    editClickTimeoutRef.current = setTimeout(() => {
      isEditingRef.current = false;
    }, 500);
  };

  // Handle modal close
  const handleCloseModal = () => {
    setShowEditModal(false);
    setShowInfoModal(false);
    setSelectedAttendance(null);
    
    isEditingRef.current = false;
    
    if (editClickTimeoutRef.current) {
      clearTimeout(editClickTimeoutRef.current);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    try {
      setDeleting(true);
      setError('');
      
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
      
      let requestBody = {};
      
      if (deleteMode === 'selected') {
        if (selectedIds.length === 0) {
          setError('Please select attendance records to delete');
          return;
        }
        requestBody = { ids: selectedIds };
      } else {
        if (!deleteRange.start_date || !deleteRange.end_date) {
          setError('Please provide both start and end dates');
          return;
        }
        requestBody = {
          start_date: deleteRange.start_date,
          end_date: deleteRange.end_date,
          employee_id: deleteRange.employee_id || null,
          department: deleteRange.department || null
        };
      }
      
      const response = await fetch('/attendance/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`Delete failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess(data.message || `Deleted ${data.deleted_count} records successfully`);
        
        await loadAttendanceData(false);
        
        setSelectedIds([]);
        setSelectAll(false);
        setShowDeleteModal(false);
        setDeleteRange({
          start_date: '',
          end_date: '',
          employee_id: '',
          department: ''
        });
      } else {
        setError('Delete failed: ' + (data.message || 'Unknown error'));
      }
      
    } catch (err) {
      console.error('Bulk delete error:', err);
      setError('Failed to delete records: ' + (err.message || 'Unknown error'));
    } finally {
      setDeleting(false);
    }
  };

  // Load departments for filter
  const loadDepartments = async () => {
    try {
      const response = await fetch('/attendance/departments', {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setDepartments(data.data);
        }
      }
    } catch (err) {
      console.error('Error loading departments:', err);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (err) {
      return 'Invalid Date';
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

  // Format numeric values
  const formatNumeric = (value, decimals = 2) => {
    if (value === null || value === undefined || value === '') return '-';
    const num = parseFloat(value);
    return isNaN(num) ? '-' : num.toFixed(decimals);
  };

  // Render late/undertime status
  const renderLateUndertime = (attendance) => {
    const lateMinutes = parseFloat(attendance.late_minutes || 0);
    const undertimeMinutes = parseFloat(attendance.undertime_minutes || 0);
    
    if (lateMinutes === 0 && undertimeMinutes === 0) {
      return (
        <div className="flex items-center space-x-1">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span className="text-xs text-green-600 font-medium">On Time</span>
        </div>
      );
    }
    
    return (
      <div className="space-y-1">
        {lateMinutes > 0 && (
          <div className="flex items-center space-x-1">
            <Clock className="h-3 w-3 text-red-500" />
            <span className="text-xs text-red-600">
              {Math.floor(lateMinutes / 60) > 0 ? `${Math.floor(lateMinutes / 60)}h ` : ''}
              {Math.round(lateMinutes % 60)}m late
            </span>
          </div>
        )}
        {undertimeMinutes > 0 && (
          <div className="flex items-center space-x-1">
            <AlertTriangle className="h-3 w-3 text-orange-500" />
            <span className="text-xs text-orange-600">
              {Math.floor(undertimeMinutes / 60) > 0 ? `${Math.floor(undertimeMinutes / 60)}h ` : ''}
              {Math.round(undertimeMinutes % 60)}m under
            </span>
          </div>
        )}
      </div>
    );
  };

  // Render night shift indicator
  const renderNightShift = (attendance) => {
    if (attendance.is_nightshift) {
      return (
        <div className="flex items-center space-x-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
          <Moon className="h-3 w-3" />
          <span>Night</span>
        </div>
      );
    }
    return (
      <div className="flex items-center space-x-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
        <Sun className="h-3 w-3" />
        <span>Day</span>
      </div>
    );
  };

  // Render status badges
  const renderStatusBadge = (value, type = 'boolean') => {
    if (type === 'source') {
      const sourceColors = {
        'manual_edit': 'bg-red-100 text-red-800',
        'slvl_sync': 'bg-indigo-100 text-indigo-800',
        'import': 'bg-blue-100 text-blue-800',
        'biometric': 'bg-green-100 text-green-800',
        'unknown': 'bg-gray-100 text-gray-800'
      };
      
      const colorClass = sourceColors[value] || sourceColors['unknown'];
      const displayText = value === 'manual_edit' ? 'Edited' : 
                         value === 'slvl_sync' ? 'SLVL' :
                         value === 'import' ? 'Import' :
                         value === 'biometric' ? 'Bio' : 'Unknown';
      
      return (
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
          {displayText}
        </span>
      );
    }
    
    if (value) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          ✓
        </span>
      );
    }
    
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        -
      </span>
    );
  };

  // Render posting status
  const renderPostingStatus = (attendance) => {
    if (attendance.posting_status === 'posted') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Posted
        </span>
      );
    }
    
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        <AlertCircle className="h-3 w-3 mr-1" />
        Not Posted
      </span>
    );
  };

  // Load preview when post modal data changes
  useEffect(() => {
  if (showPostModal && postData.year && postData.month && postData.period_type) {
    const timeoutId = setTimeout(() => {
      loadPostPreview();
    }, 300); // Debounce to avoid too many API calls
    
    return () => clearTimeout(timeoutId);
  }
}, [showPostModal, postData.year, postData.month, postData.period_type, postData.department, postData.employee_ids]);

  // Show recalculation message if records were auto-recalculated
  useEffect(() => {
    if (recalculated_count > 0) {
      setSuccess(`Auto-recalculated ${recalculated_count} attendance records for accurate display`);
    }
  }, [recalculated_count]);

  // Auto-clear success/error messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (editClickTimeoutRef.current) {
        clearTimeout(editClickTimeoutRef.current);
      }
      if (holdTimer) {
        clearTimeout(holdTimer);
      }
    };
  }, [holdTimer]);

  // Auto-recalculate on component mount and when filters change
useEffect(() => {
  // Only auto-recalculate when there's actual data and specific conditions
  const shouldAutoRecalculate = attendances.length > 0 && 
    (dateFilter || departmentFilter || editsOnlyFilter || nightShiftFilter);
  
  if (shouldAutoRecalculate) {
    // Add a delay to prevent too many rapid requests
    const timeoutId = setTimeout(() => {
      handleAutoRecalculate(false); // Don't show message for auto-recalc
    }, 1000);
    
    return () => clearTimeout(timeoutId);
  }
}, [dateFilter, departmentFilter, editsOnlyFilter, nightShiftFilter]);

  // Initialize component data
  useEffect(() => {
    loadDepartments();
  }, []);

  // Handle page changes
  useEffect(() => {
    if (currentPage !== pagination.current_page) {
      loadAttendanceData(false);
    }
  }, [currentPage]);

  // Handle filter changes with debouncing
  useEffect(() => {
    const delayedApply = setTimeout(() => {
      if (searchTerm !== '' || dateFilter !== '' || departmentFilter !== '' || 
          editsOnlyFilter !== false || nightShiftFilter !== false || postingStatusFilter !== '') {
        applyFilters();
      }
    }, 500);

    return () => clearTimeout(delayedApply);
  }, [searchTerm]);

  // Apply filters immediately for other filter types
  useEffect(() => {
  applyFilters();
}, [dateFilter, departmentFilter, editsOnlyFilter, nightShiftFilter, postingStatusFilter, problemsOnlyFilter]);

  return (
    <AuthenticatedLayout user={auth.user}>
      <Head title="Processed Attendance List" />
      <div className="flex min-h-screen bg-gray-50/50">
        <Sidebar />
        <div className="flex-1 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              {/* Header Text Section */}
              <div className="mb-4">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">
                  Processed Attendance Records (Non-Posted Only)
                </h1>
                <p className="text-sm sm:text-base text-gray-600">
                  View and manage non-posted attendance records with automatic recalculation and payroll posting.
                </p>
                <p className="text-xs sm:text-sm text-blue-600 mt-1">
                  💡 Tip: Hold any row for 1 second to view details, double-click to edit attendance times
                </p>
                {recalculated_count > 0 && (
                  <p className="text-xs sm:text-sm text-green-600 mt-1">
                    ✅ Auto-recalculated {recalculated_count} records for accurate display
                  </p>
                )}
              </div>
              
              {/* Action Buttons Section */}
              <div className="flex flex-wrap items-center gap-2">
                {/* POST Button - Primary Action */}
                <Button
                  onClick={() => setShowPostModal(true)}
                  disabled={posting}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white border-green-600 text-xs sm:text-sm"
                >
                  {posting ? (
                    <>
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 animate-spin" />
                      <span className="hidden sm:inline">Posting...</span>
                      <span className="sm:hidden">Post...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                      <span className="hidden sm:inline">POST to Payroll</span>
                      <span className="sm:hidden">POST</span>
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleDetectDtrProblems}
                  disabled={detectingProblems || loading}
                  variant="outline"
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white border-red-600 text-xs sm:text-sm"
                  title="Detect DTR problems in current view"
                >
                  {detectingProblems ? (
                    <>
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 animate-spin" />
                      <span className="hidden sm:inline">Detecting...</span>
                      <span className="sm:hidden">Det...</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                      <span className="hidden sm:inline">Detect DTR Problems</span>
                      <span className="sm:hidden">DTR Check</span>
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => handleAutoRecalculate(true)}
                  disabled={recalculating || loading} // FIXED: Also disable when loading
                  variant="outline"
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white border-purple-600 text-xs sm:text-sm"
                  title="Manually recalculate late/undertime for current view"
                >
                  {recalculating ? (
                    <>
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 animate-spin" />
                      <span className="hidden sm:inline">Recalculating...</span>
                      <span className="sm:hidden">Calc...</span>
                    </>
                  ) : (
                    <>
                      <Calculator className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                      <span className="hidden sm:inline">Recalculate</span>
                      <span className="sm:hidden">Calc</span>
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleDownloadTemplate}
                  disabled={exporting}
                  variant="outline"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 text-xs sm:text-sm"
                >
                  {exporting ? (
                    <>
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 animate-spin" />
                      <span className="hidden sm:inline">Downloading...</span>
                      <span className="sm:hidden">Down...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                      <span className="hidden sm:inline">Download</span>
                      <span className="sm:hidden">Down</span>
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => setShowImportModal(true)}
                  variant="outline"
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 text-xs sm:text-sm"
                >
                  <Upload className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  Import
                </Button>

                <Button
                  onClick={() => setShowHolidayModal(true)}
                  variant="outline"
                  size="sm"
                  className="bg-orange-600 hover:bg-orange-700 text-white border-orange-600 text-xs sm:text-sm"
                >
                  <Target className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  <span className="hidden sm:inline">Set Holiday</span>
                  <span className="sm:hidden">Holiday</span>
                </Button>
                
                <Button
                  onClick={handleExport}
                  disabled={exporting}
                  variant="outline"
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white border-green-600 text-xs sm:text-sm"
                >
                  {exporting ? (
                    <>
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 animate-spin" />
                      <span className="hidden sm:inline">Exporting...</span>
                      <span className="sm:hidden">Exp...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                      Export
                    </>
                  )}
                </Button>
                
                {selectedIds.length > 0 && (
                  <Button
                    onClick={() => {
                      setDeleteMode('selected');
                      setShowDeleteModal(true);
                    }}
                    variant="outline"
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white border-red-600 text-xs sm:text-sm"
                  >
                    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                    <span className="hidden sm:inline">Delete ({selectedIds.length})</span>
                    <span className="sm:hidden">Del ({selectedIds.length})</span>
                  </Button>
                )}
                
                <Button
                  onClick={() => {
                    setDeleteMode('range');
                    setShowDeleteModal(true);
                  }}
                  variant="outline"
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white border-red-600 text-xs sm:text-sm"
                >
                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  <span className="hidden sm:inline">Delete Range</span>
                  <span className="sm:hidden">Del Range</span>
                </Button>
                
                <Button
                  onClick={handleSync}
                  disabled={syncing}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm"
                >
                  {syncing ? (
                    <>
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 animate-spin" />
                      <span className="hidden sm:inline">Syncing...</span>
                      <span className="sm:hidden">Sync...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                      <span className="hidden sm:inline">Sync Data</span>
                      <span className="sm:hidden">Sync</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4 mr-2" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="mb-4 border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                <AlertDescription className="text-green-800">{success}</AlertDescription>
              </Alert>
            )}

            {/* Show recalculation status */}
            {recalculating && (
              <Alert className="mb-4 border-purple-200 bg-purple-50">
                <Calculator className="h-4 w-4 mr-2 text-purple-600 animate-pulse" />
                <AlertDescription className="text-purple-800">
                  Recalculating attendance metrics for accurate late/undertime display...
                </AlertDescription>
              </Alert>
            )}

            {/* Show posting status */}
            {posting && (
              <Alert className="mb-4 border-green-200 bg-green-50">
                <Send className="h-4 w-4 mr-2 text-green-600 animate-pulse" />
                <AlertDescription className="text-green-800">
                  Posting attendance records to payroll summaries...
                </AlertDescription>
              </Alert>
            )}

            {/* Filters Card */}
            <Card className="mb-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Filters</span>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <span>Auto-recalculation: Enabled</span>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <input
                      type="text"
                      placeholder="Search by ID or Name..."
                      className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <input
                        type="date"
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <select
                      className="w-full pl-4 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={departmentFilter}
                      onChange={(e) => setDepartmentFilter(e.target.value)}
                    >
                      <option value="">All Departments</option>
                      {departments.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <select
                      className="w-full pl-4 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={postingStatusFilter}
                      onChange={(e) => setPostingStatusFilter(e.target.value)}
                    >
                      <option value="">All Status</option>
                      <option value="posted">Posted</option>
                      <option value="not_posted">Not Posted</option>
                    </select>
                  </div>
                </div>
                
                {/* Second row of filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500"
                        checked={editsOnlyFilter}
                        onChange={(e) => setEditsOnlyFilter(e.target.checked)}
                      />
                      <span className="text-gray-700">Edited Records Only</span>
                    </label>
                  </div>
                  <div>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="form-checkbox h-5 w-5 text-red-600 rounded focus:ring-red-500"
                        checked={problemsOnlyFilter}
                        onChange={(e) => setProblemsOnlyFilter(e.target.checked)}
                      />
                      <div className="flex items-center space-x-1">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <span className="text-gray-700">Problems Only</span>
                      </div>
                    </label>
                  </div>
                </div>
                
                {/* <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={resetFilters}>Reset</Button>
                  <Button onClick={applyFilters}>
                    <Filter className="h-4 w-4 mr-2" />
                    Apply Filters
                  </Button>
                </div> */}
              </CardContent>
            </Card>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <Users className="h-8 w-8 text-blue-500" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Total Records</p>
                      <p className="text-2xl font-bold text-gray-900">{attendances.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <AlertTriangle className="h-8 w-8 text-red-500" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Problem Records</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {attendances.filter(att => {
                          const problems = detectRecordProblems(att);
                          return problems && problems.length > 0;
                        }).length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <Edit className="h-8 w-8 text-orange-500" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Edited Records</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {attendances.filter(att => att.source === 'manual_edit').length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <Moon className="h-8 w-8 text-purple-500" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Night Shifts</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {attendances.filter(att => att.is_nightshift).length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <CheckCircle className="h-8 w-8 text-green-500" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Selected</p>
                      <p className="text-2xl font-bold text-gray-900">{selectedIds.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center">
                    <FileText className="h-8 w-8 text-purple-500" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Current Page</p>
                      <p className="text-2xl font-bold text-gray-900">{currentPage} of {totalPages}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Table container */}
            <div className="bg-white rounded-lg shadow h-[70vh] flex flex-col w-full">
              {loading ? (
                <div className="flex justify-center items-center h-full">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="ml-2 text-lg">Loading...</span>
                </div>
              ) : attendances.length === 0 ? (
                <div className="text-center py-12 flex-1 flex flex-col justify-center">
                  <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-600 mb-2">No attendance records found</h3>
                  <p className="text-gray-500">Try adjusting your filters or adding new attendance data.</p>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="overflow-x-auto flex-1">
                      <table className="min-w-full divide-y divide-gray-200 h-full">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <input
                              type="checkbox"
                              className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                              checked={selectAll}
                              onChange={(e) => handleSelectAll(e.target.checked)}
                            />
                          </th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dept</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time In</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Break Out</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Break In</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time Out</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Late/Under</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Night Shift</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OT</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Travel</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SLVL</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CT</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CS</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Holiday</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Offset</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rest Day</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Retro</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <div className="flex items-center space-x-1">
                              <Car className="h-4 w-4" />
                              <span>Trip</span>
                            </div>
                          </th>
                          {/* ADD THESE NEW COLUMNS */}
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OT Reg</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OT Spl</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <div className="flex items-center space-x-1">
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                              <span>DTR Status</span>
                            </div>
                          </th>
                          <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                        <tbody className="bg-white divide-y divide-gray-200 overflow-y-auto">
                          {attendances.map((attendance) => (
                            <tr 
                                key={attendance.id} 
                                className={`hover:bg-blue-50 cursor-pointer transition-colors select-none ${
                                  attendance.source === 'manual_edit' ? 'bg-red-50' : ''
                                } ${isHolding ? 'bg-blue-100' : ''} ${
                                  (() => {
                                    const problems = detectRecordProblems(attendance);
                                    return problems && problems.length > 0 ? 'border-l-4 border-red-400' : '';
                                  })()
                                }`}
                                onMouseDown={(e) => handleMouseDown(e, attendance)}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseLeave}
                                onDoubleClick={(e) => handleRowDoubleClick(e, attendance)}
                                title="Hold for 1 second to view details, double-click to edit attendance times"
                              >
                              <td 
                                className="px-2 py-4 whitespace-nowrap"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                                  checked={selectedIds.includes(attendance.id)}
                                  onChange={(e) => handleCheckboxChange(e, attendance.id)}
                                />
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {attendance.employee_name || 'Unknown Employee'}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {attendance.idno || 'N/A'}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {attendance.department || 'N/A'}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatDate(attendance.attendance_date)}
                                {attendance.day && <span className="block text-xs mt-1 text-gray-400">{attendance.day}</span>}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatTime(attendance.time_in)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatTime(attendance.break_out)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatTime(attendance.break_in)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {attendance.is_nightshift && attendance.next_day_timeout 
                                  ? formatTime(attendance.next_day_timeout)
                                  : formatTime(attendance.time_out)
                                }
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap">
                                {renderLateUndertime(attendance)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap">
                                {renderNightShift(attendance)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatNumeric(attendance.hours_worked)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatNumeric(attendance.overtime)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatNumeric(attendance.travel_order, 1)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatNumeric(attendance.slvl, 1)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {renderStatusBadge(attendance.ct)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {renderStatusBadge(attendance.cs)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatNumeric(attendance.holiday)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div className="flex items-center space-x-1">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    parseFloat(attendance.offset || 0) > 0 
                                      ? 'bg-blue-100 text-blue-800' 
                                      : 'bg-gray-100 text-gray-500'
                                  }`}>
                                    {formatNumeric(attendance.offset)} hrs
                                  </span>
                                </div>
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {attendance.restday ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                    <Calendar className="h-3 w-3 mr-1" />
                                    Rest Day
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                    Regular
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div className="flex items-center space-x-1">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    parseFloat(attendance.retromultiplier || 0) > 0 
                                      ? 'bg-purple-100 text-purple-800' 
                                      : 'bg-gray-100 text-gray-500'
                                  }`}>
                                    ₱{formatNumeric(attendance.retromultiplier, 2)}
                                  </span>
                                </div>
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div className="flex items-center space-x-1">
                                  <Car className="h-3 w-3 text-blue-500" />
                                  <span>{formatNumeric(attendance.trip, 1)}</span>
                                </div>
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatNumeric(attendance.ot_reg_holiday)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatNumeric(attendance.ot_special_holiday)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap">
                                {renderStatusBadge(attendance.source, 'source')}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap">
                                {renderPostingStatus(attendance)}
                              </td>
                              <td className="px-2 py-4 whitespace-nowrap relative group">
                                {renderProblemIndicator(attendance)}
                                {/* Tooltip that appears on hover */}
                                <div className="invisible group-hover:visible absolute z-50">
                                  {renderProblemsTooltip(attendance)}
                                </div>
                              </td>
                              <td 
                                className="px-2 py-4 whitespace-nowrap text-right text-sm font-medium"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex justify-end space-x-1">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedAttendance(attendance);
                                      setShowInfoModal(true);
                                    }}
                                    className="text-blue-600 hover:text-blue-900"
                                    type="button"
                                    title="View Details"
                                  >
                                    <Info className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={(e) => handleEditClick(e, attendance)}
                                    disabled={isEditingRef.current}
                                    className="text-blue-600 hover:text-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                    type="button"
                                    title="Edit Attendance"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Pagination */}
                  <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200 bg-white">
                    <div className="flex-1 flex justify-between sm:hidden">
                      <Button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        variant="outline"
                        size="sm"
                      >
                        Previous
                      </Button>
                      <Button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        variant="outline"
                        size="sm"
                      >
                        Next
                      </Button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Showing page <span className="font-medium">{currentPage}</span> of{' '}
                          <span className="font-medium">{totalPages}</span>
                        </p>
                      </div>
                      <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                          <Button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            variant="outline"
                            size="sm"
                            className="rounded-l-md"
                          >
                            First
                          </Button>
                          <Button
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            variant="outline"
                            size="sm"
                          >
                            Previous
                          </Button>
                          
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const pageNum = currentPage <= 3 
                              ? i + 1 
                              : (currentPage >= totalPages - 2 
                                ? totalPages - 4 + i 
                                : currentPage - 2 + i);
                            
                            if (pageNum > 0 && pageNum <= totalPages) {
                              return (
                                <Button
                                  key={pageNum}
                                  onClick={() => setCurrentPage(pageNum)}
                                  variant={currentPage === pageNum ? "default" : "outline"}
                                  size="sm"
                                  className={currentPage === pageNum ? "bg-blue-500 text-white" : ""}
                                >
                                  {pageNum}
                                </Button>
                              );
                            }
                            return null;
                          })}
                          
                          <Button
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            variant="outline"
                            size="sm"
                          >
                            Next
                          </Button>
                          <Button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            variant="outline"
                            size="sm"
                            className="rounded-r-md"
                          >
                            Last
                          </Button>
                        </nav>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* DTR Problems Modal */}
          {showProblemsModal && problemSummary && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
              <div className="relative bg-white rounded-lg shadow-lg max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b">
                  <h2 className="text-xl font-semibold text-gray-800">DTR Problems Detection</h2>
                  <button
                    onClick={() => {
                      setShowProblemsModal(false);
                      setProblemRecords([]);
                      setProblemSummary(null);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-6">
                  {/* Summary Section */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center">
                        <FileText className="h-8 w-8 text-blue-500" />
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-600">Total Records</p>
                          <p className="text-2xl font-bold text-gray-900">{problemSummary.total_records}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-600">Problem Records</p>
                          <p className="text-2xl font-bold text-gray-900">{problemSummary.problem_records}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center">
                        <CheckCircle className="h-8 w-8 text-green-500" />
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-600">Clean Records</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {problemSummary.total_records - problemSummary.problem_records}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center">
                        <Calculator className="h-8 w-8 text-purple-500" />
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-600">Success Rate</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {problemSummary.total_records > 0 
                              ? Math.round(((problemSummary.total_records - problemSummary.problem_records) / problemSummary.total_records) * 100)
                              : 0}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Problem Types Breakdown */}
                  <div className="mb-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-3">Problem Types Breakdown</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      {Object.entries(problemSummary.problems).map(([type, count]) => (
                        count > 0 && (
                          <div key={type} className="bg-gray-50 border rounded-lg p-3">
                            <p className="text-xs font-medium text-gray-600 capitalize">
                              {type.replace(/_/g, ' ')}
                            </p>
                            <p className="text-lg font-bold text-red-600">{count}</p>
                          </div>
                        )
                      ))}
                    </div>
                  </div>

                  {/* Problem Records Table */}
                  {problemRecords.length > 0 ? (
                    <div className="overflow-x-auto">
                      <h3 className="text-lg font-medium text-gray-900 mb-3">Records with Problems</h3>
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Problems</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time In/Out</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {problemRecords.map((record) => (
                            <tr key={record.id} className="hover:bg-gray-50">
                              <td className="px-3 py-4 whitespace-nowrap">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{record.employee_name}</div>
                                  <div className="text-xs text-gray-500">{record.employee_no}</div>
                                </div>
                              </td>
                              <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                                {record.attendance_date}
                              </td>
                              <td className="px-3 py-4 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  record.severity === 'high' ? 'bg-red-100 text-red-800' :
                                  record.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {record.severity.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-3 py-4">
                                <div className="space-y-1">
                                  {record.problems.map((problem, index) => (
                                    <div key={index} className="text-xs">
                                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                                        problem.severity === 'high' ? 'bg-red-50 text-red-700' :
                                        problem.severity === 'medium' ? 'bg-yellow-50 text-yellow-700' :
                                        'bg-gray-50 text-gray-700'
                                      }`}>
                                        {problem.message}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                                <div>
                                  <div>In: {record.time_in || '-'}</div>
                                  <div>Out: {record.time_out || '-'}</div>
                                </div>
                              </td>
                              <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                                {record.hours_worked || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Problems Found!</h3>
                      <p className="text-gray-500">All DTR records in the current view are clean and valid.</p>
                    </div>
                  )}

                  <div className="flex justify-end mt-6">
                    <Button
                      onClick={() => {
                        setShowProblemsModal(false);
                        setProblemRecords([]);
                        setProblemSummary(null);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
      
      {/* Edit Modal */}
      {showEditModal && selectedAttendance && (
        <AttendanceEditModal
          isOpen={showEditModal}
          attendance={selectedAttendance}
          onClose={handleCloseModal}
          onSave={handleAttendanceUpdate}
          onSync={handleIndividualSync}
        />
      )}

      {/* Info Modal */}
      {showInfoModal && selectedAttendance && (
        <AttendanceInfoModal
          isOpen={showInfoModal}
          attendance={selectedAttendance}
          onClose={handleCloseModal}
          onEdit={() => {
            setShowInfoModal(false);
            setShowEditModal(true);
          }}
        />
      )}

      {/* POST Modal */}
      {showPostModal && (
  <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
    <div className="relative bg-white rounded-lg shadow-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center p-6 border-b">
        <h2 className="text-xl font-semibold text-gray-800">POST to Payroll</h2>
        <button
          onClick={() => {
            setShowPostModal(false);
            setPostPreview(null);
            setError(''); // Clear errors when closing
          }}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Close"
          disabled={posting}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-6">
        {/* Enhanced Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-red-800">Error</h4>
                <div className="mt-1 text-sm text-red-700">
                  {error.split('\n').map((line, index) => (
                    <div key={index}>{line}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success Display */}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-green-800">Success</h4>
                <p className="mt-1 text-sm text-green-700">{success}</p>
              </div>
            </div>
          </div>
        )}

        {/* Post Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Year *
            </label>
            <input
              type="number"
              min="2020"
              max="2030"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              value={postData.year}
              onChange={(e) => {
                setError(''); // Clear errors when changing values
                setPostData(prev => ({ ...prev, year: parseInt(e.target.value) || new Date().getFullYear() }));
              }}
              disabled={posting || loadingPreview}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Month *
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              value={postData.month}
              onChange={(e) => {
                setError(''); // Clear errors when changing values
                setPostData(prev => ({ ...prev, month: parseInt(e.target.value) }));
              }}
              disabled={posting || loadingPreview}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2024, i, 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Period *
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              value={postData.period_type}
              onChange={(e) => {
                setError(''); // Clear errors when changing values
                setPostData(prev => ({ ...prev, period_type: e.target.value }));
              }}
              disabled={posting || loadingPreview}
            >
              <option value="1st_half">1st Half (1-15)</option>
              <option value="2nd_half">2nd Half (16-30/31)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Department (Optional)
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              value={postData.department}
              onChange={(e) => {
                setError(''); // Clear errors when changing values
                setPostData(prev => ({ ...prev, department: e.target.value }));
              }}
              disabled={posting || loadingPreview}
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Preview Section (unchanged) */}
        {loadingPreview && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center">
              <RefreshCw className="h-5 w-5 text-blue-600 animate-spin mr-2" />
              <span className="text-blue-800">Loading preview...</span>
            </div>
          </div>
        )}

        {/* ... rest of preview section remains the same ... */}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-6 border-t">
          <Button
            variant="outline"
            onClick={() => {
              setShowPostModal(false);
              setPostPreview(null);
              setError(''); // Clear errors when canceling
            }}
            disabled={posting}
          >
            Cancel
          </Button>
          
          <Button
            onClick={handlePostToPayroll}
            disabled={posting || !postPreview || postPreview.totals.employees === 0 || !postData.year || !postData.month || !postData.period_type}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {posting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Posting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Confirm POST ({postPreview ? postPreview.totals.employees : 0} employees)
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  </div>
)}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-800">Import Attendance Data</h2>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                }}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close"
                disabled={importing}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select CSV File
                </label>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => setImportFile(e.target.files[0])}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={importing}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Upload a CSV file with attendance data. Maximum size: 10MB
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-blue-800 mb-2">Required CSV Format:</h4>
                <p className="text-sm text-blue-700">
                  Employee Number, Employee Name, Department, Date, Day, Time In, Break Out, Break In, Time Out, Next Day Timeout, Hours Worked, Night Shift, Trip
                </p>
              </div>

              <div className="flex justify-end space-x-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                  }}
                  disabled={importing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importing || !importFile}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {importing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import Data
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Holiday Modal */}
      {showHolidayModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-800">Set Holiday</h2>
              <button
                onClick={() => {
                  setShowHolidayModal(false);
                  setHolidayData({
                    date: '',
                    multiplier: '2.0',
                    department: '',
                    employee_ids: []
                  });
                }}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close"
                disabled={settingHoliday}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Holiday Date *
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    value={holidayData.date}
                    onChange={(e) => setHolidayData(prev => ({ ...prev, date: e.target.value }))}
                    disabled={settingHoliday}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Holiday Multiplier *
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    value={holidayData.multiplier}
                    onChange={(e) => setHolidayData(prev => ({ ...prev, multiplier: e.target.value }))}
                    disabled={settingHoliday}
                  >
                    <option value="1.3">1.3 (Special Holiday)</option>
                    <option value="2.0">2.0 (Regular Holiday)</option>
                    <option value="2.6">2.6 (Regular Holiday + OT)</option>
                    <option value="1.69">1.69 (Special Holiday + OT)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Department (Optional)
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    value={holidayData.department}
                    onChange={(e) => setHolidayData(prev => ({ ...prev, department: e.target.value }))}
                    disabled={settingHoliday}
                  >
                    <option value="">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    Leave empty to apply to all departments
                  </p>
                </div>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mt-4">
                <h4 className="font-medium text-orange-800 mb-2">Note:</h4>
                <p className="text-sm text-orange-700">
                  This will set the holiday multiplier for all eligible attendance records on the selected date. 
                  Records with existing overtime will be excluded.
                </p>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowHolidayModal(false);
                    setHolidayData({
                      date: '',
                      multiplier: '2.0',
                      department: '',
                      employee_ids: []
                    });
                  }}
                  disabled={settingHoliday}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSetHoliday}
                  disabled={settingHoliday || !holidayData.date || !holidayData.multiplier}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {settingHoliday ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Setting...
                    </>
                  ) : (
                    <>
                      <Target className="h-4 w-4 mr-2" />
                      Set Holiday
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-800">Delete Attendance Records</h2>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteRange({
                    start_date: '',
                    end_date: '',
                    employee_id: '',
                    department: ''
                  });
                }}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close"
                disabled={deleting}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="deleteMode"
                      value="selected"
                      checked={deleteMode === 'selected'}
                      onChange={(e) => setDeleteMode(e.target.value)}
                      disabled={deleting}
                      className="form-radio h-4 w-4 text-red-600"
                    />
                    <span className="ml-2 text-sm text-gray-700">Delete Selected ({selectedIds.length} records)</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="deleteMode"
                      value="range"
                      checked={deleteMode === 'range'}
                      onChange={(e) => setDeleteMode(e.target.value)}
                      disabled={deleting}
                      className="form-radio h-4 w-4 text-red-600"
                    />
                    <span className="ml-2 text-sm text-gray-700">Delete by Date Range</span>
                  </label>
                </div>
              </div>

              {deleteMode === 'range' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Date *
                      </label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        value={deleteRange.start_date}
                        onChange={(e) => setDeleteRange(prev => ({ ...prev, start_date: e.target.value }))}
                        disabled={deleting}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Date *
                      </label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        value={deleteRange.end_date}
                        onChange={(e) => setDeleteRange(prev => ({ ...prev, end_date: e.target.value }))}
                        disabled={deleting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Department (Optional)
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      value={deleteRange.department}
                      onChange={(e) => setDeleteRange(prev => ({ ...prev, department: e.target.value }))}
                      disabled={deleting}
                    >
                      <option value="">All Departments</option>
                      {departments.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
                <div className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-red-800">Warning</h4>
                    <p className="text-sm text-red-700 mt-1">
                      This action cannot be undone. {deleteMode === 'selected' 
                        ? `${selectedIds.length} selected records will be permanently deleted.`
                        : 'All attendance records in the specified date range will be permanently deleted.'
                      }
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteRange({
                      start_date: '',
                      end_date: '',
                      employee_id: '',
                      department: ''
                    });
                  }}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkDelete}
                  disabled={deleting || (deleteMode === 'selected' && selectedIds.length === 0) || 
                           (deleteMode === 'range' && (!deleteRange.start_date || !deleteRange.end_date))}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Confirm Delete
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AuthenticatedLayout>
  );
};

export default ProcessedAttendanceList;