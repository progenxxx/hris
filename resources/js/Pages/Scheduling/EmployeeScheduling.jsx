import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Head, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Sidebar from '@/Components/Sidebar';
import axios from 'axios';
import { 
    Calendar, 
    Search, 
    Filter, 
    ChevronDown, 
    Edit2, 
    Trash2,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Clock,
    Users,
    CalendarDays,
    Plus,
    RefreshCw,
    Building,
    User,
    Download,
    Upload,
    FileText,
    List,
    Grid
} from 'lucide-react';
import { Button } from '@/Components/ui/Button';
import { Card, CardContent } from '@/Components/ui/card';
import { Alert, AlertDescription } from '@/Components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/Components/ui/tabs';
import { debounce } from 'lodash';
import * as XLSX from 'xlsx';

// FullCalendar imports
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';

// Toast Component
const Toast = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 3000);
        
        return () => clearTimeout(timer);
    }, [onClose]);
    
    const bgColor = type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
    const textColor = type === 'success' ? 'text-green-700' : 'text-red-700';
    const icon = type === 'success' ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />;
    
    return (
        <div className={`fixed top-4 right-4 z-50 flex items-center p-4 mb-4 rounded-lg shadow-md border ${bgColor}`} role="alert">
            <div className="inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg">
                {icon}
            </div>
            <div className={`ml-3 text-sm font-normal ${textColor}`}>{message}</div>
            <button 
                type="button" 
                className={`ml-auto -mx-1.5 -my-1.5 rounded-lg focus:ring-2 p-1.5 inline-flex h-8 w-8 ${textColor} hover:bg-gray-100`} 
                onClick={onClose}
                aria-label="Close"
            >
                <XCircle className="w-5 h-5" />
            </button>
        </div>
    );
};

// Summary Card Component
const SummaryCard = ({ icon, title, count, color }) => (
    <Card className="border-t-4 shadow-md hover:shadow-lg transition-shadow duration-200" style={{ borderTopColor: color }}>
        <CardContent className="p-6">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
                    <p className="text-2xl font-bold">{count}</p>
                </div>
                <div className="p-3 rounded-full" style={{ backgroundColor: `${color}20` }}>
                    {icon}
                </div>
            </div>
        </CardContent>
    </Card>
);

// Import Modal Component
const ImportModal = ({ isOpen, onClose, onImport }) => {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            previewFile(selectedFile);
        }
    };

    const previewFile = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const workbook = XLSX.read(e.target.result, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                setPreview(data.slice(0, 5)); // Show first 5 rows as preview
            } catch (error) {
                console.error('Error reading file:', error);
                alert('Error reading file. Please make sure it\'s a valid Excel file.');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleImport = async () => {
        if (!file) return;
        
        setIsProcessing(true);
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const workbook = XLSX.read(e.target.result, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const data = XLSX.utils.sheet_to_json(sheet);
                    
                    await onImport(data);
                    onClose();
                    setFile(null);
                    setPreview([]);
                } catch (error) {
                    console.error('Import error:', error);
                    alert('Error importing data: ' + error.message);
                }
                setIsProcessing(false);
            };
            reader.readAsArrayBuffer(file);
        } catch (error) {
            setIsProcessing(false);
            alert('Error processing file: ' + error.message);
        }
    };

    const downloadTemplate = () => {
        const template = [
            ['Employee ID', 'Shift Type', 'Work Days', 'Start Time', 'End Time', 'Break Start', 'Break End', 'Status', 'Notes'],
            ['EMP001', 'regular', 'Monday,Tuesday,Wednesday,Thursday,Friday', '08:00', '17:00', '12:00', '13:00', 'active', 'Sample schedule'],
            ['EMP002', 'night', 'Monday,Tuesday,Wednesday,Thursday,Friday', '22:00', '06:00', '02:00', '03:00', 'active', 'Night shift worker'],
        ];
        
        const ws = XLSX.utils.aoa_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.writeFile(wb, 'employee_schedule_template.xlsx');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">Import Employee Schedules</h2>
                
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-gray-600">Upload an Excel file with employee schedule data</p>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={downloadTemplate}
                            className="text-sm"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Download Template
                        </Button>
                    </div>

                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <div className="text-center">
                            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-600 mb-2">Click to select an Excel file</p>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Choose File
                            </Button>
                            {file && (
                                <p className="text-sm text-green-600 mt-2">Selected: {file.name}</p>
                            )}
                        </div>
                    </div>

                    {preview.length > 0 && (
                        <div>
                            <h3 className="font-medium mb-2">Preview (First 5 rows)</h3>
                            <div className="border rounded-lg overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <tbody>
                                        {preview.map((row, index) => (
                                            <tr key={index} className={index === 0 ? 'bg-gray-50 font-medium' : ''}>
                                                {row.map((cell, cellIndex) => (
                                                    <td key={cellIndex} className="px-4 py-2 text-sm border-r">
                                                        {cell}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end space-x-3 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                onClose();
                                setFile(null);
                                setPreview([]);
                            }}
                            disabled={isProcessing}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleImport}
                            disabled={!file || isProcessing}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {isProcessing ? 'Processing...' : 'Import Data'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Schedule Form Modal Component
const ScheduleFormModal = ({ isOpen, onClose, onSubmit, employees, editingSchedule }) => {
    const [formData, setFormData] = useState({
        employee_ids: [],
        shift_type: 'regular',
        work_days: [],
        start_time: '08:00',
        end_time: '17:00',
        break_start: '12:00',
        break_end: '13:00',
        effective_date: '',
        end_date: '',
        status: 'active',
        notes: ''
    });

    const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');

    const workDayOptions = [
        { value: 'monday', label: 'Monday' },
        { value: 'tuesday', label: 'Tuesday' },
        { value: 'wednesday', label: 'Wednesday' },
        { value: 'thursday', label: 'Thursday' },
        { value: 'friday', label: 'Friday' },
        { value: 'saturday', label: 'Saturday' },
        { value: 'sunday', label: 'Sunday' }
    ];

    const shiftTypeOptions = [
        { value: 'regular', label: 'Regular Shift' },
        { value: 'night', label: 'Night Shift' },
        { value: 'flexible', label: 'Flexible Shift' },
        { value: 'rotating', label: 'Rotating Shift' }
    ];

    // Filter employees based on search term
    const filteredEmployees = employees.filter(emp => {
        const searchLower = employeeSearchTerm.toLowerCase();
        const fullName = `${emp.Fname || ''} ${emp.Lname || ''}`.toLowerCase();
        const idno = (emp.idno || '').toLowerCase();
        const department = (emp.Department || '').toLowerCase();
        
        return fullName.includes(searchLower) || 
               idno.includes(searchLower) || 
               department.includes(searchLower);
    });

    useEffect(() => {
        if (editingSchedule) {
            setFormData({
                employee_ids: [editingSchedule.employee_id] || [],
                shift_type: editingSchedule.shift_type || 'regular',
                work_days: editingSchedule.work_days || [],
                start_time: editingSchedule.start_time || '08:00',
                end_time: editingSchedule.end_time || '17:00',
                break_start: editingSchedule.break_start || '12:00',
                break_end: editingSchedule.break_end || '13:00',
                effective_date: editingSchedule.effective_date || '',
                end_date: editingSchedule.end_date || '',
                status: editingSchedule.status || 'active',
                notes: editingSchedule.notes || ''
            });
        } else {
            setFormData({
                employee_ids: [],
                shift_type: 'regular',
                work_days: [],
                start_time: '08:00',
                end_time: '17:00',
                break_start: '12:00',
                break_end: '13:00',
                effective_date: '',
                end_date: '',
                status: 'active',
                notes: ''
            });
        }
        // Reset employee search when modal opens/closes
        setEmployeeSearchTerm('');
    }, [editingSchedule, isOpen]);

    const handleWorkDayChange = (day) => {
        setFormData(prev => ({
            ...prev,
            work_days: prev.work_days.includes(day)
                ? prev.work_days.filter(d => d !== day)
                : [...prev.work_days, day]
        }));
    };

    const selectWeekdays = () => {
        setFormData(prev => ({
            ...prev,
            work_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
        }));
    };

    const selectWeekends = () => {
        setFormData(prev => ({
            ...prev,
            work_days: ['saturday', 'sunday']
        }));
    };

    const selectAllDays = () => {
        setFormData(prev => ({
            ...prev,
            work_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        }));
    };

    const clearAllDays = () => {
        setFormData(prev => ({
            ...prev,
            work_days: []
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">
                    {editingSchedule ? 'Edit Schedule' : 'Create New Schedule'}
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Employee Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Employees *
                        </label>
                        
                        {/* Search Input */}
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                            <input
                                type="text"
                                placeholder="Search employees by name, ID, or department..."
                                value={employeeSearchTerm}
                                onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                disabled={!!editingSchedule}
                            />
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mb-3">
                            <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, employee_ids: filteredEmployees.map(emp => emp.id) }))}
                                className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                disabled={!!editingSchedule}
                            >
                                Select All {filteredEmployees.length !== employees.length ? `(${filteredEmployees.length})` : ''}
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, employee_ids: [] }))}
                                className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                disabled={!!editingSchedule}
                            >
                                Clear All
                            </button>
                        </div>
                        
                        <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                            <div className="p-2">
                                {filteredEmployees.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500">
                                        <User className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                        <p className="text-sm">
                                            {employeeSearchTerm ? 'No employees found matching your search' : 'No employees available'}
                                        </p>
                                    </div>
                                ) : (
                                    filteredEmployees.map(emp => (
                                    <label key={emp.id} className="flex items-center space-x-3 py-2 px-2 hover:bg-gray-50 rounded cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.employee_ids.includes(emp.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        employee_ids: [...prev.employee_ids, emp.id]
                                                    }));
                                                } else {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        employee_ids: prev.employee_ids.filter(id => id !== emp.id)
                                                    }));
                                                }
                                            }}
                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            disabled={!!editingSchedule}
                                        />
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-gray-900">
                                                {emp.Fname} {emp.Lname}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {emp.idno} - {emp.Department}
                                            </div>
                                        </div>
                                    </label>
                                    ))
                                )}
                            </div>
                        </div>
                        
                        {formData.employee_ids.length === 0 && (
                            <p className="text-red-500 text-sm mt-1">Please select at least one employee</p>
                        )}
                        
                        {formData.employee_ids.length > 0 && (
                            <p className="text-gray-500 text-sm mt-1">
                                {formData.employee_ids.length} employee{formData.employee_ids.length !== 1 ? 's' : ''} selected
                                {employeeSearchTerm && (
                                    <span className="text-gray-400 ml-1">
                                        (from {filteredEmployees.length} shown)
                                    </span>
                                )}
                            </p>
                        )}
                    </div>

                    {/* Shift Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Shift Type *
                        </label>
                        <select
                            value={formData.shift_type}
                            onChange={(e) => setFormData(prev => ({ ...prev, shift_type: e.target.value }))}
                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            required
                        >
                            {shiftTypeOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Work Days */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Work Days *
                        </label>
                        
                        <div className="flex flex-wrap gap-2 mb-3">
                            <button
                                type="button"
                                onClick={selectWeekdays}
                                className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                                Weekdays
                            </button>
                            <button
                                type="button"
                                onClick={selectWeekends}
                                className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                            >
                                Weekends
                            </button>
                            <button
                                type="button"
                                onClick={selectAllDays}
                                className="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                            >
                                All Days
                            </button>
                            <button
                                type="button"
                                onClick={clearAllDays}
                                className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                            >
                                Clear All
                            </button>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            {workDayOptions.map(day => (
                                <label key={day.value} className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.work_days.includes(day.value)}
                                        onChange={() => handleWorkDayChange(day.value)}
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm">{day.label}</span>
                                </label>
                            ))}
                        </div>
                        {formData.work_days.length === 0 && (
                            <p className="text-red-500 text-sm mt-1">Please select at least one work day</p>
                        )}
                    </div>

                    {/* Time Settings */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Start Time *
                            </label>
                            <input
                                type="time"
                                value={formData.start_time}
                                onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                End Time *
                            </label>
                            <input
                                type="time"
                                value={formData.end_time}
                                onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                required
                            />
                        </div>
                    </div>

                    {/* Break Times */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Break Start
                            </label>
                            <input
                                type="time"
                                value={formData.break_start}
                                onChange={(e) => setFormData(prev => ({ ...prev, break_start: e.target.value }))}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Break End
                            </label>
                            <input
                                type="time"
                                value={formData.break_end}
                                onChange={(e) => setFormData(prev => ({ ...prev, break_end: e.target.value }))}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Date Range */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Effective Date *
                            </label>
                            <input
                                type="date"
                                value={formData.effective_date}
                                onChange={(e) => setFormData(prev => ({ ...prev, effective_date: e.target.value }))}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                End Date (Optional)
                            </label>
                            <input
                                type="date"
                                value={formData.end_date}
                                onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Status */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Status
                        </label>
                        <select
                            value={formData.status}
                            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="pending">Pending</option>
                        </select>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Notes
                        </label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            rows="3"
                            placeholder="Additional notes or comments..."
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-700"
                            disabled={formData.work_days.length === 0 || formData.employee_ids.length === 0}
                        >
                            {editingSchedule ? 'Update Schedule' : 'Create Schedule'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Calendar View Component
const CalendarView = ({ schedules, onScheduleClick, onDateClick }) => {
    const formatScheduleForCalendar = (schedules) => {
        const events = [];
        
        schedules.forEach(schedule => {
            // Create events for each work day
            if (schedule.work_days && Array.isArray(schedule.work_days)) {
                schedule.work_days.forEach(day => {
                    // Create events for each work day within the effective date range
                    const effectiveDate = new Date(schedule.effective_date);
                    const endDate = schedule.end_date ? new Date(schedule.end_date) : new Date(effectiveDate.getTime() + (365 * 24 * 60 * 60 * 1000)); // Default to 1 year if no end date
                    
                    const currentDate = new Date(effectiveDate);
                    
                    while (currentDate <= endDate) {
                        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                        const eventDayName = dayNames[currentDate.getDay()];
                        
                        if (eventDayName === day.toLowerCase()) {
                            const eventDate = new Date(currentDate);
                            const startDateTime = new Date(eventDate);
                            const endDateTime = new Date(eventDate);
                            
                            if (schedule.start_time) {
                                const [startHour, startMinute] = schedule.start_time.split(':');
                                startDateTime.setHours(parseInt(startHour), parseInt(startMinute), 0);
                            }
                            
                            if (schedule.end_time) {
                                const [endHour, endMinute] = schedule.end_time.split(':');
                                endDateTime.setHours(parseInt(endHour), parseInt(endMinute), 0);
                            }

                            events.push({
                                id: `${schedule.id}-${eventDate.toISOString().split('T')[0]}`,
                                title: `${schedule.employee?.Fname} ${schedule.employee?.Lname} - ${schedule.shift_type}`,
                                start: startDateTime,
                                end: endDateTime,
                                backgroundColor: schedule.shift_type === 'night' ? '#8b5cf6' : 
                                               schedule.shift_type === 'flexible' ? '#06b6d4' :
                                               schedule.shift_type === 'rotating' ? '#f59e0b' : '#10b981',
                                borderColor: 'transparent',
                                extendedProps: {
                                    schedule: schedule,
                                    employeeName: `${schedule.employee?.Fname} ${schedule.employee?.Lname}`,
                                    department: schedule.employee?.Department,
                                    shiftType: schedule.shift_type,
                                    status: schedule.status
                                }
                            });
                        }
                        
                        // Move to next day
                        currentDate.setDate(currentDate.getDate() + 1);
                    }
                });
            }
        });
        
        return events;
    };

    const calendarEvents = formatScheduleForCalendar(schedules);

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
                }}
                events={calendarEvents}
                eventClick={(info) => {
                    onScheduleClick && onScheduleClick(info.event.extendedProps.schedule);
                }}
                dateClick={(info) => {
                    onDateClick && onDateClick(info.date);
                }}
                height="600px"
                eventTextColor="#ffffff"
                eventDisplay="block"
                dayMaxEvents={3}
                moreLinkClick="popover"
                eventTimeFormat={{
                    hour: 'numeric',
                    minute: '2-digit',
                    meridiem: 'short'
                }}
                slotLabelFormat={{
                    hour: 'numeric',
                    minute: '2-digit',
                    meridiem: 'short'
                }}
                eventDidMount={(info) => {
                    // Add tooltip functionality
                    info.el.title = `${info.event.extendedProps.employeeName} - ${info.event.extendedProps.department}\nShift: ${info.event.extendedProps.shiftType}\nStatus: ${info.event.extendedProps.status}`;
                }}
            />
        </div>
    );
};

// List View Component (existing table implementation)
const ListView = ({ schedules, onEdit, onDelete, isLoading, formatTime }) => {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4">
                <h2 className="text-lg font-semibold mb-4">Employee Schedules</h2>
                
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
                                    Shift Type
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Work Time
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Work Days
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Date Range
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {isLoading && (
                                <tr>
                                    <td colSpan="8" className="px-6 py-12 text-center">
                                        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                                        <p className="mt-2 text-gray-600">Loading schedules...</p>
                                    </td>
                                </tr>
                            )}

                            {!isLoading && schedules.length === 0 && (
                                <tr>
                                    <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                                        <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                                        <p className="text-lg font-medium">No schedules found</p>
                                        <p className="text-sm">Create a new schedule to get started.</p>
                                    </td>
                                </tr>
                            )}

                            {!isLoading && schedules.length > 0 && schedules.map((schedule, index) => (
                                <tr key={schedule.id || `schedule-${index}`} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10">
                                                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                                                    <User className="h-5 w-5 text-indigo-600" />
                                                </div>
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {schedule.employee?.Fname || 'N/A'} {schedule.employee?.Lname || ''}
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    ID: {schedule.employee?.idno || 'N/A'}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <Building className="h-4 w-4 text-gray-400 mr-2" />
                                            <span className="text-sm text-gray-900">
                                                {schedule.employee?.Department || 'N/A'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            schedule.shift_type === 'regular' ? 'bg-green-100 text-green-800' :
                                            schedule.shift_type === 'night' ? 'bg-purple-100 text-purple-800' :
                                            schedule.shift_type === 'flexible' ? 'bg-blue-100 text-blue-800' :
                                            schedule.shift_type === 'rotating' ? 'bg-orange-100 text-orange-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            <Clock className="h-3 w-3 mr-1" />
                                            {schedule.shift_type ? schedule.shift_type.charAt(0).toUpperCase() + schedule.shift_type.slice(1) : 'N/A'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <div className="flex flex-col">
                                            <span className="font-medium">
                                                {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                                            </span>
                                            {schedule.break_start && schedule.break_end && (
                                                <span className="text-xs text-gray-500">
                                                    Break: {formatTime(schedule.break_start)} - {formatTime(schedule.break_end)}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <div className="flex flex-col">
                                            <span className="font-medium">
                                                {schedule.work_days_formatted || 'N/A'}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {schedule.schedules_count || 0} day records
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <div className="flex flex-col">
                                            <span className="font-medium">
                                                {schedule.effective_date ? new Date(schedule.effective_date).toLocaleDateString() : 'N/A'}
                                            </span>
                                            {schedule.end_date && (
                                                <span className="text-xs text-gray-500">
                                                    to {new Date(schedule.end_date).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                            schedule.status === 'active' ? 'bg-green-100 text-green-800' :
                                            schedule.status === 'inactive' ? 'bg-red-100 text-red-800' :
                                            schedule.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {schedule.status === 'active' && <CheckCircle className="h-3 w-3 mr-1" />}
                                            {schedule.status === 'inactive' && <XCircle className="h-3 w-3 mr-1" />}
                                            {schedule.status === 'pending' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                            {schedule.status ? schedule.status.charAt(0).toUpperCase() + schedule.status.slice(1) : 'N/A'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex items-center justify-end space-x-2">
                                            <button 
                                                onClick={() => onEdit(schedule)}
                                                className="text-indigo-600 hover:text-indigo-900 p-1 rounded-md hover:bg-indigo-50"
                                                title="Edit Schedule"
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </button>
                                            <button 
                                                onClick={() => onDelete(schedule)}
                                                className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-red-50"
                                                title="Delete Schedule"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// Main Employee Scheduling Component
const EmployeeScheduling = () => {
    const { auth, flash, employees: initialEmployees } = usePage().props;
    
    // State management
    const [schedules, setSchedules] = useState([]);
    const [employees, setEmployees] = useState(initialEmployees || []);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [shiftFilter, setShiftFilter] = useState('');
    const [workDayFilter, setWorkDayFilter] = useState('');
    const [departments, setDepartments] = useState([]);
    const [filterOpen, setFilterOpen] = useState(false);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [activeTab, setActiveTab] = useState('calendar');
    
    // Toast state
    const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });

    // Show toast notification
    const showToast = (message, type = 'success') => {
        setToast({ visible: true, message, type });
    };

    // Close toast notification
    const closeToast = () => {
        setToast(prev => ({ ...prev, visible: false }));
    };

    // Handle search input change with debounce
    const handleSearchChange = (e) => {
        const value = e.target.value;
        debouncedSearch(value);
    };

    // Debounced search handler
    const debouncedSearch = debounce((value) => {
        setSearchTerm(value);
    }, 300);

    // Load data function
    const loadData = useCallback(async () => {
        console.log('🔍 Starting loadData with filters:', {
            searchTerm,
            departmentFilter,
            statusFilter,
            shiftFilter,
            workDayFilter
        });
        
        setIsLoading(true);
        setError(null);
        
        try {
            const params = new URLSearchParams();
            if (searchTerm) params.append('search', searchTerm);
            if (departmentFilter) params.append('department', departmentFilter);
            if (statusFilter) params.append('status', statusFilter);
            if (shiftFilter) params.append('shift_type', shiftFilter);
            if (workDayFilter) params.append('work_day', workDayFilter);
            
            const url = `/employee-schedules/list?${params.toString()}`;
            console.log('📡 Making request to:', url);
            
            const response = await axios.get(url);
            console.log('📨 Full API Response:', response);

            let schedulesData = [];
            
            if (response.data && response.data.success) {
                schedulesData = response.data.schedules || [];
                console.log('✅ Success response, schedules found:', schedulesData);
            }

            console.log('✅ Final processed schedules:', schedulesData);
            console.log('✅ Setting schedules state with', schedulesData.length, 'items');
            
            setSchedules(schedulesData);
            
        } catch (error) {
            console.error('❌ Error in loadData:', error);
            setError('Failed to load schedule data. Please try again later.');
            setSchedules([]);
            showToast('Failed to load schedule data. Please try again later.', 'error');
        } finally {
            setIsLoading(false);
            console.log('🏁 loadData completed');
        }
    }, [searchTerm, departmentFilter, statusFilter, shiftFilter, workDayFilter]);

    // Load data on component mount and when filters change
    useEffect(() => {
        console.log('🎯 useEffect triggered for loadData');
        loadData();
    }, [loadData]);

    // Fetch employees
    useEffect(() => {
        const fetchEmployees = async () => {
            if (!employees || employees.length === 0) {
                try {
                    console.log('👥 Fetching employees...');
                    const response = await axios.get('/employees/list', { 
                        params: { active_only: true } 
                    });
                    console.log('👥 Employees response:', response.data);
                    const employeesData = response.data.data || response.data || [];
                    setEmployees(employeesData);
                } catch (error) {
                    console.error('Error fetching employees:', error);
                }
            }
        };

        fetchEmployees();
    }, [employees]);

    // Fetch departments
    useEffect(() => {
        const fetchDepartments = async () => {
            try {
                console.log('🏢 Fetching departments...');
                const response = await axios.get('/employee-schedules/departments');
                console.log('🏢 Departments response:', response.data);
                const departmentsData = response.data.data || response.data || [];
                setDepartments(departmentsData);
            } catch (error) {
                console.error('Error fetching departments:', error);
            }
        };

        fetchDepartments();
    }, []);

    // Handle reset filters
    const handleResetFilters = () => {
        setSearchTerm('');
        setDepartmentFilter('');
        setStatusFilter('');
        setShiftFilter('');
        setWorkDayFilter('');
        
        // Reset the search input field
        const searchInput = document.querySelector('input[placeholder*="Search"]');
        if (searchInput) {
            searchInput.value = '';
        }
    };

    // Handle create/edit schedule
    const handleScheduleSubmit = async (formData) => {
        try {
            const url = editingSchedule 
                ? `/employee-schedules/${editingSchedule.id}`
                : '/employee-schedules';
            
            const method = editingSchedule ? 'put' : 'post';
            
            const response = await axios[method](url, formData);
            
            if (response.data.success) {
                showToast(
                    editingSchedule 
                        ? 'Schedule updated successfully' 
                        : `Schedule created for ${formData.work_days.length} days`,
                    'success'
                );
                setShowModal(false);
                setEditingSchedule(null);
                loadData(); // Refresh the list
            }
        } catch (error) {
            console.error('Error saving schedule:', error);
            showToast(
                error.response?.data?.message || 'Failed to save schedule',
                'error'
            );
        }
    };

    // Handle delete schedule
    const handleDeleteSchedule = async (schedule) => {
        if (!confirm('Are you sure you want to delete this schedule? This will remove all related day schedules.')) {
            return;
        }

        try {
            const response = await axios.delete(`/employee-schedules/${schedule.id}`);
            
            if (response.data.success) {
                showToast(
                    `Schedule deleted successfully (${response.data.schedules_deleted} records removed)`,
                    'success'
                );
                loadData(); // Refresh the list
            }
        } catch (error) {
            console.error('Error deleting schedule:', error);
            showToast(
                error.response?.data?.message || 'Failed to delete schedule',
                'error'
            );
        }
    };

    // Handle import
    const handleImport = async (importData) => {
        try {
            const response = await axios.post('/employee-schedules/import', {
                data: importData
            });
            
            if (response.data.success) {
                showToast(`Successfully imported ${response.data.imported_count} schedules`, 'success');
                loadData(); // Refresh the list
            }
        } catch (error) {
            console.error('Error importing data:', error);
            showToast(
                error.response?.data?.message || 'Failed to import data',
                'error'
            );
        }
    };

    // Handle export
    const handleExport = () => {
        const exportData = schedules.map(schedule => ({
            'Employee Name': `${schedule.employee?.Fname || ''} ${schedule.employee?.Lname || ''}`,
            'Employee ID': schedule.employee?.idno || '',
            'Department': schedule.employee?.Department || '',
            'Shift Type': schedule.shift_type || '',
            'Work Days': schedule.work_days_formatted || '',
            'Start Time': schedule.start_time || '',
            'End Time': schedule.end_time || '',
            'Break Start': schedule.break_start || '',
            'Break End': schedule.break_end || '',
            'Effective Date': schedule.effective_date || '',
            'End Date': schedule.end_date || '',
            'Status': schedule.status || '',
            'Notes': schedule.notes || ''
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Employee Schedules');
        
        // Auto-size columns
        const colWidths = [];
        const headers = Object.keys(exportData[0] || {});
        headers.forEach((header, index) => {
            const maxLength = Math.max(
                header.length,
                ...exportData.map(row => String(row[header] || '').length)
            );
            colWidths[index] = { width: Math.min(maxLength + 2, 50) };
        });
        ws['!cols'] = colWidths;
        
        const fileName = `employee_schedules_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
        showToast('Schedules exported successfully', 'success');
    };

    // Get summary statistics
    const getSummaryStats = () => {
        const active = schedules.filter(s => s.status === 'active').length;
        const inactive = schedules.filter(s => s.status === 'inactive').length;
        const pending = schedules.filter(s => s.status === 'pending').length;
        const regular = schedules.filter(s => s.shift_type === 'regular').length;
        const night = schedules.filter(s => s.shift_type === 'night').length;
        
        return {
            total: schedules.length,
            active,
            inactive,
            pending,
            regular,
            night
        };
    };

    const stats = getSummaryStats();

    // Format time for display
    const formatTime = (time) => {
        if (!time) return '';
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${period}`;
    };

    // Handle calendar schedule click
    const handleScheduleClick = (schedule) => {
        setEditingSchedule(null); // Always open as new schedule
        setShowModal(true);
    };

    // Handle calendar date click
    const handleDateClick = (date) => {
        setEditingSchedule(null); // Always open as new schedule
        setShowModal(true);
        // Could pre-fill the effective date with the clicked date
    };

    return (
        <AuthenticatedLayout user={auth.user}>
            <Head title="Employee Scheduling" />
            <div className="flex min-h-screen bg-gray-50">
                <Sidebar />
                <div className="flex-1 p-6">
                    <div className="max-w-7xl mx-auto">
                        {/* Toast Notification */}
                        {toast.visible && (
                            <Toast 
                                message={toast.message}
                                type={toast.type}
                                onClose={closeToast}
                            />
                        )}

                        {flash?.message && (
                            <Alert className="mb-6">
                                <AlertDescription>{flash.message}</AlertDescription>
                            </Alert>
                        )}

                        {error && (
                            <Alert className="mb-6 bg-red-50 border border-red-200 text-red-800">
                                <AlertDescription className="text-red-700">{error}</AlertDescription>
                            </Alert>
                        )}

                        {/* Header Section */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center">
                                        <CalendarDays className="h-6 w-6 mr-2 text-indigo-600" />
                                        Employee Scheduling
                                    </h1>
                                    <p className="text-gray-600">
                                        Manage employee work schedules with calendar and list views. Import/export schedules and create manual entries.
                                    </p>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <Button
                                        onClick={handleExport}
                                        variant="outline"
                                        className="shadow-sm"
                                        disabled={schedules.length === 0}
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        Export
                                    </Button>
                                    <Button
                                        onClick={() => setShowImportModal(true)}
                                        variant="outline"
                                        className="shadow-sm"
                                    >
                                        <Upload className="h-4 w-4 mr-2" />
                                        Import
                                    </Button>
                                    <Button
                                        onClick={() => setShowModal(true)}
                                        className="bg-indigo-600 hover:bg-indigo-700 shadow-sm"
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        New Schedule
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
                            <SummaryCard 
                                icon={<Users className="h-5 w-5 text-indigo-600" />} 
                                title="Total Employees" 
                                count={stats.total}
                                color="#6366f1"
                            />
                            <SummaryCard 
                                icon={<CheckCircle className="h-5 w-5 text-emerald-600" />} 
                                title="Active" 
                                count={stats.active}
                                color="#10b981"
                            />
                            <SummaryCard 
                                icon={<XCircle className="h-5 w-5 text-red-600" />} 
                                title="Inactive" 
                                count={stats.inactive}
                                color="#ef4444"
                            />
                            <SummaryCard 
                                icon={<Clock className="h-5 w-5 text-amber-600" />} 
                                title="Pending" 
                                count={stats.pending}
                                color="#f59e0b"
                            />
                            <SummaryCard 
                                icon={<Calendar className="h-5 w-5 text-emerald-600" />} 
                                title="Regular Shift" 
                                count={stats.regular}
                                color="#10b981"
                            />
                            <SummaryCard 
                                icon={<Calendar className="h-5 w-5 text-purple-600" />} 
                                title="Night Shift" 
                                count={stats.night}
                                color="#8b5cf6"
                            />
                        </div>

                        {/* Filter Section */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                                <div className="relative flex-grow">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                                    <input
                                        type="text"
                                        placeholder="Search employees, departments..."
                                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                                        onChange={handleSearchChange}
                                    />
                                </div>
                                
                                <div className="inline-flex">
                                    <Button
                                        variant="outline"
                                        onClick={() => setFilterOpen(!filterOpen)}
                                        className="flex items-center shadow-sm hover:bg-gray-50"
                                    >
                                        <Filter className="h-4 w-4 mr-2 text-indigo-500" />
                                        Filters
                                        <ChevronDown className={`h-4 w-4 ml-2 transform ${filterOpen ? 'rotate-180' : ''} text-indigo-500`} />
                                    </Button>
                                </div>
                            </div>
                            
                            {filterOpen && (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
                                    <div>
                                        <label htmlFor="departmentFilter" className="block text-sm font-medium text-gray-700 mb-1">
                                            Department
                                        </label>
                                        <select
                                            id="departmentFilter"
                                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                            value={departmentFilter}
                                            onChange={(e) => setDepartmentFilter(e.target.value)}
                                        >
                                            <option value="">All Departments</option>
                                            {departments.map((dept, index) => (
                                                <option key={index} value={dept}>
                                                    {dept}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 mb-1">
                                            Status
                                        </label>
                                        <select
                                            id="statusFilter"
                                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                            value={statusFilter}
                                            onChange={(e) => setStatusFilter(e.target.value)}
                                        >
                                            <option value="">All Statuses</option>
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                            <option value="pending">Pending</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor="shiftFilter" className="block text-sm font-medium text-gray-700 mb-1">
                                            Shift Type
                                        </label>
                                        <select
                                            id="shiftFilter"
                                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                            value={shiftFilter}
                                            onChange={(e) => setShiftFilter(e.target.value)}
                                        >
                                            <option value="">All Shifts</option>
                                            <option value="regular">Regular Shift</option>
                                            <option value="night">Night Shift</option>
                                            <option value="flexible">Flexible Shift</option>
                                            <option value="rotating">Rotating Shift</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor="workDayFilter" className="block text-sm font-medium text-gray-700 mb-1">
                                            Work Day
                                        </label>
                                        <select
                                            id="workDayFilter"
                                            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                            value={workDayFilter}
                                            onChange={(e) => setWorkDayFilter(e.target.value)}
                                        >
                                            <option value="">All Days</option>
                                            <option value="monday">Monday</option>
                                            <option value="tuesday">Tuesday</option>
                                            <option value="wednesday">Wednesday</option>
                                            <option value="thursday">Thursday</option>
                                            <option value="friday">Friday</option>
                                            <option value="saturday">Saturday</option>
                                            <option value="sunday">Sunday</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Reset Filters Button */}
                            {(searchTerm || departmentFilter || statusFilter || shiftFilter || workDayFilter) && (
                                <div className="mt-4 flex justify-end">
                                    <Button
                                        onClick={handleResetFilters}
                                        variant="outline"
                                        className="text-sm"
                                    >
                                        Reset Filters
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Tabs for Calendar and List View */}
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                            <TabsList className="bg-white p-1 shadow-sm border border-gray-100">
                                <TabsTrigger value="calendar" className="flex items-center space-x-2 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                                    <Grid className="h-4 w-4" />
                                    <span>Calendar View</span>
                                </TabsTrigger>
                                <TabsTrigger value="list" className="flex items-center space-x-2 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                                    <List className="h-4 w-4" />
                                    <span>List View</span>
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="calendar" className="space-y-4">
                                <CalendarView 
                                    schedules={schedules}
                                    onScheduleClick={handleScheduleClick}
                                    onDateClick={handleDateClick}
                                />
                            </TabsContent>

                            <TabsContent value="list" className="space-y-4">
                                <ListView 
                                    schedules={schedules}
                                    onEdit={(schedule) => {
                                        setEditingSchedule(schedule);
                                        setShowModal(true);
                                    }}
                                    onDelete={handleDeleteSchedule}
                                    isLoading={isLoading}
                                    formatTime={formatTime}
                                />
                            </TabsContent>
                        </Tabs>

                        {/* Schedule Form Modal */}
                        <ScheduleFormModal
                            isOpen={showModal}
                            onClose={() => {
                                setShowModal(false);
                                setEditingSchedule(null);
                            }}
                            onSubmit={handleScheduleSubmit}
                            employees={employees}
                            editingSchedule={editingSchedule}
                        />

                        {/* Import Modal */}
                        <ImportModal
                            isOpen={showImportModal}
                            onClose={() => setShowImportModal(false)}
                            onImport={handleImport}
                        />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
};

export default EmployeeScheduling;