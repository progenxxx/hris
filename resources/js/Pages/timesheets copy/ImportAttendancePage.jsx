import React, { useState, useCallback } from 'react';
import { Head, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Sidebar from '@/Components/Sidebar';
import { Alert, AlertDescription, AlertTitle } from '@/Components/ui/alert';
import { Button } from '@/Components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/Components/ui/card';
import { 
    UploadCloud, 
    FileSpreadsheet, 
    Download, 
    AlertCircle, 
    Clock,
    CheckCircle2,
    XCircle 
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Keep the existing Loader component
const Loader = () => (
    <div className="animate-spin h-5 w-5">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

const ImportAttendancePage = () => {
    const { auth } = usePage().props;
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [importResult, setImportResult] = useState(null);
    const [validationStatus, setValidationStatus] = useState(null);
    const [showSuccessActions, setShowSuccessActions] = useState(false);

    const requiredColumns = [
        'employee_no',
        'date',
        'day',
        'in1',
        'out1',
        'in2',
        'out2',
        'nextday',
        'hours_work'
    ];

    const resetState = () => {
        setFile(null);
        setPreview([]);
        setError('');
        setImportResult(null);
        setValidationStatus(null);
    };

    // Updated date formatter to handle Excel dates
    const formatDate = (date) => {
        if (!date) return '';
        try {
            // Check if the date is a number (Excel serial date)
            if (typeof date === 'number') {
                // Excel date serial numbers start from 1900-01-01
                // Convert Excel serial date to JavaScript Date
                // Need to adjust for Excel's date system
                const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
                const millisecondsPerDay = 24 * 60 * 60 * 1000;
                const dateObj = new Date(excelEpoch.getTime() + date * millisecondsPerDay);
                
                const year = dateObj.getFullYear();
                const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                const day = String(dateObj.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
            
            // Handle string dates
            const d = new Date(date);
            if (isNaN(d.getTime())) return date;
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        } catch {
            return date;
        }
    };

    // Updated time formatter to HH:mm am/pm
    const formatTime = (time) => {
        if (!time) return '';
        try {
            // Handle Excel time (decimal)
            if (typeof time === 'number') {
                const totalSeconds = Math.round(time * 86400);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const period = hours >= 12 ? 'pm' : 'am';
                const formattedHours = hours % 12 || 12;
                return `${String(formattedHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
            }

            // Convert string time to proper format
            const d = new Date(`2000-01-01 ${time}`);
            if (isNaN(d.getTime())) return time;
            
            const hours = d.getHours();
            const minutes = d.getMinutes();
            const period = hours >= 12 ? 'pm' : 'am';
            const formattedHours = hours % 12 || 12;
            return `${String(formattedHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
        } catch {
            return time;
        }
    };

    // Format numeric values for hours_work
    const formatNumeric = (value) => {
        if (value === null || value === undefined || value === '') return '';
        const numValue = parseFloat(value);
        return isNaN(numValue) ? value : numValue.toFixed(2);
    };

    const validateHeaders = (headers) => {
        const missingColumns = requiredColumns.filter(
            col => !headers.map(h => h.toLowerCase()).includes(col.toLowerCase())
        );
        return {
            valid: missingColumns.length === 0,
            missingColumns
        };
    };

    const formatRowData = (row, headers) => {
        return row.map((cell, index) => {
            const header = headers[index]?.toLowerCase();
            if (!header) return cell;

            switch (header) {
                case 'date':
                    return formatDate(cell);
                case 'in1':
                case 'out1':
                case 'in2':
                case 'out2':
                case 'nextday':
                    return formatTime(cell);
                case 'hours_work':
                    return formatNumeric(cell);
                default:
                    return cell;
            }
        });
    };

    // Keep all existing functions (handleFileChange, handleUpload, downloadTemplate)
    const handleFileChange = useCallback(async (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];

        if (!allowedTypes.includes(selectedFile.type)) {
            setError('Please upload only Excel files (.xlsx or .xls)');
            setValidationStatus('error');
            return;
        }

        if (selectedFile.size > 10 * 1024 * 1024) {  
            setError('File size should not exceed 10MB');
            setValidationStatus('error');
            return;
        }

        setFile(selectedFile);
        setError('');
        setValidationStatus('validating');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                if (!jsonData[0] || jsonData[0].length === 0) {
                    throw new Error('File appears to be empty');
                }

                const headerValidation = validateHeaders(jsonData[0]);
                
                if (!headerValidation.valid) {
                    setError(`Missing required columns: ${headerValidation.missingColumns.join(', ')}`);
                    setValidationStatus('error');
                    setFile(null);
                    return;
                }

                // Format the preview data
                const previewData = jsonData
                    .filter(row => row.some(cell => cell !== ''))
                    .slice(0, 6)
                    .map((row, index) => 
                        index === 0 ? row : formatRowData(row, jsonData[0])
                    );
                
                setPreview(previewData);
                setValidationStatus('success');
            } catch (error) {
                setError('Error reading file. Please make sure it\'s a valid Excel file.');
                setValidationStatus('error');
                setFile(null);
            }
        };
        reader.readAsArrayBuffer(selectedFile);
    }, []);

    // Keep existing handleUpload and downloadTemplate functions
    const handleUpload = async () => {
        if (!file) {
            setError('Please select a file first');
            return;
        }

        setUploading(true);
        setError('');
        setImportResult(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/attendance/import', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
                },
                credentials: 'same-origin',
                body: formData,
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Import failed');
            }

            setImportResult(data);
            if (data.failures?.length === 0) {
                setShowSuccessActions(true);
                /* resetState(); */
            }
        } catch (error) {
            console.error('Import error:', error);
            setError(error.message || 'Import failed. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const downloadTemplate = async () => {
        try {
            const response = await fetch('/attendance/template/download', {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
                },
                credentials: 'same-origin'
            });

            if (!response.ok) {
                throw new Error('Failed to download template');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'attendance_import_template.xlsx';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download error:', error);
            setError('Failed to download template. Please try again later.');
        }
    };

    // Keep the existing return statement with all UI components
    return (
        <AuthenticatedLayout user={auth.user}>
            <Head title="Import Attendance Records" />
            <div className="flex min-h-screen bg-gray-50/50">
                <Sidebar />
                <div className="flex-1 p-8">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 mb-1">
                                    Import Attendance Records
                                </h1>
                                <p className="text-gray-600">
                                    Bulk import employee attendance data using our Excel template.
                                </p>
                            </div>
                        </div>

                        <Card className="max-w-4xl mx-auto">
                            <CardHeader>
                                <CardTitle>Import Attendance</CardTitle>
                                <p className="text-gray-600">
                                    Upload your Excel file containing attendance records with employee numbers, dates, and time entries.
                                </p>
                            </CardHeader>

                            <CardContent>
                                <div className="space-y-6">
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <h3 className="text-sm font-medium text-blue-800 mb-2">Required Columns:</h3>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {requiredColumns.map((col) => (
                                                <div key={col} className="flex items-center text-sm text-blue-700">
                                                    <div className="w-2 h-2 bg-blue-400 rounded-full mr-2" />
                                                    {col}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <Button
                                        onClick={downloadTemplate}
                                        variant="outline"
                                        className="w-full"
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        Download Attendance Import Template
                                    </Button>

                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
                                        <input
                                            type="file"
                                            onChange={handleFileChange}
                                            className="hidden"
                                            id="file-upload"
                                            accept=".xlsx,.xls"
                                        />
                                        <label
                                            htmlFor="file-upload"
                                            className="cursor-pointer flex flex-col items-center"
                                        >
                                            {validationStatus === 'success' ? (
                                                <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                                            ) : validationStatus === 'error' ? (
                                                <XCircle className="h-12 w-12 text-red-500 mb-4" />
                                            ) : (
                                                <UploadCloud className="h-12 w-12 text-gray-400 mb-4" />
                                            )}
                                            <span className="text-gray-600 text-center">
                                                {file ? (
                                                    <div className="flex items-center gap-2">
                                                        <FileSpreadsheet className="h-5 w-5" />
                                                        {file.name}
                                                    </div>
                                                ) : (
                                                    'Drop your Excel file here or click to browse'
                                                )}
                                            </span>
                                        </label>
                                    </div>

                                    {preview.length > 0 && (
                                        <div className="border rounded-lg overflow-hidden">
                                            <div className="overflow-x-auto">
                                                <table className="min-w-full divide-y divide-gray-200">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            {preview[0].map((header, index) => (
                                                                <th
                                                                    key={index}
                                                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                                                >
                                                                    {header}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                        {preview.slice(1).map((row, rowIndex) => (
                                                            <tr key={rowIndex}>
                                                                {row.map((cell, cellIndex) => (
                                                                    <td
                                                                        key={cellIndex}
                                                                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                                                                    >
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

                                    {error && (
                                        <Alert variant="destructive">
                                            <AlertCircle className="h-4 w-4" />
                                            <AlertTitle>Error</AlertTitle>
                                            <AlertDescription>{error}</AlertDescription>
                                        </Alert>
                                    )}

                                    {importResult && (
                                        <Alert variant={importResult.failures?.length === 0 ? "success" : "warning"}>
                                            <AlertTitle>
                                                {importResult.failures?.length === 0 ? "Success!" : "Import Complete"}
                                            </AlertTitle>
                                            <AlertDescription>
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                        <span className="font-medium">
                                                            {importResult.message}
                                                        </span>
                                                    </div>
                                                    {importResult.successful > 0 && (
                                                        <div className="text-sm text-green-600">
                                                            Total records processed: {importResult.total_processed}
                                                        </div>
                                                    )}
                                                    {importResult.failures?.length > 0 && (
                                                        <>
                                                            <div className="flex items-center gap-2 mt-4">
                                                                <AlertCircle className="h-4 w-4 text-amber-500" />
                                                                <span className="font-medium">Failed Imports</span>
                                                            </div>
                                                            <div className="mt-2 max-h-40 overflow-y-auto border-l-2 border-amber-200 pl-4">
                                                                {importResult.failures.map((failure, index) => (
                                                                    <div key={index} className="text-sm text-amber-600 mb-1">
                                                                        Row {failure.row}: {failure.errors.join(", ")}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    <Button
                                        onClick={handleUpload}
                                        disabled={!file || uploading || validationStatus !== 'success'}
                                        className="w-full"
                                    >
                                        {uploading ? (
                                            <>
                                                <Loader />
                                                <span className="ml-2">Importing...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Clock className="w-4 h-4 mr-2" />
                                                Upload and Import Attendance
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
};

export default ImportAttendancePage;