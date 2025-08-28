import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';

const CancelRestDayForm = ({ employees, departments, onSubmit, userRoles = {} }) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // Form state
    const [formData, setFormData] = useState({
        employee_ids: [],
        rest_day_date: today,
        replacement_work_date: today,
        reason: ''
    });
    
    // Filtered employees state
    const [displayedEmployees, setDisplayedEmployees] = useState(employees || []);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('');
    
    // Check if user can select any date (past dates included)
    const canSelectAnyDate = userRoles.isSuperAdmin || userRoles.isHrdManager;
    
    // Enhanced useEffect for CancelRestDayForm employee filtering and sorting
useEffect(() => {
    // Define our categories of employees with clear priorities
    let selectedAndExactMatch = [];      // Priority 1: Selected + Exact match
    let selectedAndPartialMatch = [];    // Priority 2: Selected + Partial match  
    let selectedButNotMatched = [];      // Priority 3: Selected but no search match
    let exactSearchMatches = [];         // Priority 4: Not selected + Exact match
    let partialSearchMatches = [];       // Priority 5: Not selected + Partial match
    let otherEmployees = [];             // Priority 6: Everything else
    
    employees.forEach(employee => {
        const isSelected = formData.employee_ids.includes(employee.id);
        
        // Check search match
        let matchesSearch = true;
        let exactMatch = false;
        
        if (searchTerm) {
            const term = searchTerm.toLowerCase().trim();
            
            // Get employee name parts for comparison
            const firstName = (employee.Fname || '').toLowerCase();
            const lastName = (employee.Lname || '').toLowerCase();
            const middleName = (employee.MName || '').toLowerCase();
            const fullName = `${firstName} ${lastName}`.trim();
            const reverseName = `${lastName} ${firstName}`.trim();
            const employeeId = employee.idno?.toString().toLowerCase();
            const mappedName = (employee.name || '').toLowerCase();
            
            // Check for exact match first
            if (
                firstName === term || 
                lastName === term ||
                fullName === term ||
                reverseName === term ||
                mappedName === term ||
                employeeId === term
            ) {
                exactMatch = true;
                matchesSearch = true;
            } else {
                // Check for partial match
                matchesSearch = 
                    firstName.includes(term) || 
                    lastName.includes(term) || 
                    middleName.includes(term) ||
                    mappedName.includes(term) ||
                    employeeId?.includes(term);
            }
        }
        
        // Check department match - handle both mapped and direct data
        let matchesDepartment = true;
        if (selectedDepartment) {
            const employeeDepartment = employee.department || employee.Department || '';
            matchesDepartment = employeeDepartment === selectedDepartment;
        }
        
        // Skip if doesn't match department filter
        if (!matchesDepartment) {
            return;
        }
        
        // Categorize based on selection status and search matches
        if (isSelected && exactMatch) {
            selectedAndExactMatch.push(employee);
        } else if (isSelected && matchesSearch) {
            selectedAndPartialMatch.push(employee);
        } else if (isSelected) {
            selectedButNotMatched.push(employee);
        } else if (exactMatch) {
            exactSearchMatches.push(employee);
        } else if (matchesSearch) {
            partialSearchMatches.push(employee);
        } else if (!searchTerm) {
            // Only show non-matching employees when no search term
            otherEmployees.push(employee);
        }
    });
    
    // Sort each category alphabetically by name
    const sortByName = (a, b) => {
        const getName = (emp) => {
            if (emp.name) return emp.name.toLowerCase();
            const lastName = emp.Lname || '';
            const firstName = emp.Fname || '';
            return `${lastName}, ${firstName}`.toLowerCase();
        };
        
        return getName(a).localeCompare(getName(b));
    };
    
    selectedAndExactMatch.sort(sortByName);
    selectedAndPartialMatch.sort(sortByName);
    selectedButNotMatched.sort(sortByName);
    exactSearchMatches.sort(sortByName);
    partialSearchMatches.sort(sortByName);
    otherEmployees.sort(sortByName);
    
    // Combine all categories in priority order
    const result = [
        ...selectedAndExactMatch,
        ...selectedAndPartialMatch,
        ...selectedButNotMatched,
        ...exactSearchMatches,
        ...partialSearchMatches,
        ...otherEmployees
    ];
    
    setDisplayedEmployees(result);
}, [searchTerm, selectedDepartment, employees, formData.employee_ids]);
    
    // Handle input changes
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });
    };
    
    // Handle employee selection
    const handleEmployeeSelection = (employeeId) => {
        const numericId = parseInt(employeeId, 10);
        setFormData(prevData => {
            if (prevData.employee_ids.includes(numericId)) {
                // Remove the employee
                return {
                    ...prevData,
                    employee_ids: prevData.employee_ids.filter(id => id !== numericId)
                };
            } else {
                // Add the employee
                return {
                    ...prevData,
                    employee_ids: [...prevData.employee_ids, numericId]
                };
            }
        });
    };
    
    // Handle checkbox change
    const handleCheckboxChange = (e, employeeId) => {
        e.stopPropagation();
        handleEmployeeSelection(employeeId);
    };
    
    // Handle select all employees
    const handleSelectAll = () => {
        setFormData(prevData => {
            const displayedIds = displayedEmployees.map(emp => emp.id);
            const allSelected = displayedIds.every(id => prevData.employee_ids.includes(id));
            
            if (allSelected) {
                // Deselect all displayed employees
                return {
                    ...prevData,
                    employee_ids: prevData.employee_ids.filter(id => !displayedIds.includes(id))
                };
            } else {
                // Select all displayed employees
                const remainingSelectedIds = prevData.employee_ids.filter(id => !displayedIds.includes(id));
                return {
                    ...prevData,
                    employee_ids: [...remainingSelectedIds, ...displayedIds]
                };
            }
        });
    };
    
    // Handle form submission
    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Validate form
        if (formData.employee_ids.length === 0) {
            alert('Please select at least one employee');
            return;
        }
        
        if (!formData.rest_day_date) {
            alert('Please select the rest day date to cancel');
            return;
        }
        
        // Check that rest day date is not in the past (only for non-admin/non-HR users)
        if (!canSelectAnyDate && new Date(formData.rest_day_date) < new Date(today)) {
            alert('Cannot cancel rest day for past dates');
            return;
        }
        
        // Check that replacement work date is different from rest day date (if provided)
        if (formData.replacement_work_date && formData.replacement_work_date === formData.rest_day_date) {
            alert('Replacement work date must be different from rest day date');
            return;
        }
        
        if (!formData.reason.trim()) {
            alert('Please provide a reason for canceling the rest day');
            return;
        }
        
        // Call the onSubmit prop with the form data
        onSubmit(formData);
        
        // Reset form after submission 
        setFormData({
            employee_ids: [],
            rest_day_date: '',
            replacement_work_date: '',
            reason: ''
        });
        
        // Reset filters
        setSearchTerm('');
        setSelectedDepartment('');

        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };
    
    // Helper function to get employee name - handles both mapped and direct data
    const getEmployeeName = (employee) => {
        if (employee.name) {
            return employee.name; // Use mapped name if available
        }
        
        // Fallback to constructing name from individual fields
        const firstName = employee.Fname || '';
        const lastName = employee.Lname || '';
        const middleName = employee.MName || '';
        
        let name = lastName;
        if (firstName) {
            name += name ? ', ' + firstName : firstName;
        }
        if (middleName) {
            name += ' ' + middleName;
        }
        
        return name || `Employee #${employee.id}`;
    };
    
    // Helper function to get employee department
    const getEmployeeDepartment = (employee) => {
        return employee.department || employee.Department || '';
    };
    
    // Helper function to get employee position
    const getEmployeePosition = (employee) => {
        return employee.position || employee.Jobtitle || '';
    };
    
    // Calculate if all displayed employees are selected
    const allDisplayedSelected = displayedEmployees.length > 0 && 
        displayedEmployees.every(emp => formData.employee_ids.includes(emp.id));
    
    // Get selected employees details for display
    const selectedEmployees = employees.filter(emp => formData.employee_ids.includes(emp.id));
    
    return (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="p-4 border-b">
                <h3 className="text-lg font-semibold">Cancel Rest Day Request</h3>
                <p className="text-sm text-gray-500">Create rest day cancellation request for one or multiple employees</p>
                {canSelectAnyDate && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-sm text-blue-700">
                            <span className="font-medium">Admin/HR Privilege:</span> You can select any date including past dates for rest day cancellation.
                        </p>
                    </div>
                )}
            </div>
            
            <form onSubmit={handleSubmit}>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Employee Selection Section */}
                    <div className="md:col-span-2 bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium mb-3">Select Employees</h4>
                        
                        <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-4">
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Search by name or ID"
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-300 focus:ring focus:ring-red-200 focus:ring-opacity-50"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            
                            <div className="flex-1">
                                <select
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-300 focus:ring focus:ring-red-200 focus:ring-opacity-50"
                                    value={selectedDepartment}
                                    onChange={(e) => setSelectedDepartment(e.target.value)}
                                >
                                    <option value="">All Departments</option>
                                    {departments.map((department, index) => (
                                        <option key={index} value={department}>{department}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="md:flex-initial">
                                <button
                                    type="button"
                                    className={`w-full px-4 py-2 rounded-md ${
                                        allDisplayedSelected 
                                            ? 'bg-red-700 hover:bg-red-800' 
                                            : 'bg-red-500 hover:bg-red-600'
                                    } text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500`}
                                    onClick={handleSelectAll}
                                >
                                    {allDisplayedSelected ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                        </div>
                        
                        <div className="border rounded-md overflow-hidden max-h-60 overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-100 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                                            Select
                                        </th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            ID
                                        </th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Name
                                        </th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Department
                                        </th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Position
                                        </th>
                                    </tr>
                                </thead>
                                
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {displayedEmployees.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="px-4 py-3 text-center text-sm text-gray-500">
                                                No employees match your search criteria
                                            </td>
                                        </tr>
                                    ) : (
                                        displayedEmployees.map(employee => (
                                            <tr 
                                                key={employee.id} 
                                                className={`hover:bg-gray-50 cursor-pointer ${
                                                    formData.employee_ids.includes(employee.id) ? 'bg-red-50' : ''
                                                }`}
                                                onClick={() => handleEmployeeSelection(employee.id)}
                                            >
                                                <td className="px-4 py-2 whitespace-nowrap">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-gray-300 text-red-600 shadow-sm focus:border-red-300 focus:ring focus:ring-red-200 focus:ring-opacity-50"
                                                        checked={formData.employee_ids.includes(employee.id)}
                                                        onChange={(e) => handleCheckboxChange(e, employee.id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </td>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                                    {employee.idno || ''}
                                                </td>
                                                <td className="px-4 py-2 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {getEmployeeName(employee)}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                                    {getEmployeeDepartment(employee)}
                                                </td>
                                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                                    {getEmployeePosition(employee)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="mt-2 text-sm text-gray-600">
                            {formData.employee_ids.length > 0 ? (
                                <div>
                                    <span className="font-medium">{formData.employee_ids.length} employee(s) selected</span>
                                    {formData.employee_ids.length <= 5 && (
                                        <span className="ml-2">
                                            ({selectedEmployees.map(emp => {
                                                const name = getEmployeeName(emp);
                                                return name.split(',')[0]; // Get last name only for display
                                            }).join(', ')})
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <span className="text-red-600">No employees selected</span>
                            )}
                        </div>
                    </div>
                    
                    {/* Rest Day Cancellation Details Section */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium mb-3">Rest Day Cancellation Details</h4>
                        
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="rest_day_date" className="block text-sm font-medium text-gray-700 mb-1">
                                    Rest Day to Cancel <span className="text-red-600">*</span>
                                </label>
                                <input
                                    type="date"
                                    id="rest_day_date"
                                    name="rest_day_date"
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-300 focus:ring focus:ring-red-200 focus:ring-opacity-50"
                                    value={formData.rest_day_date}
                                    onChange={handleChange}
                                    min={canSelectAnyDate ? undefined : today}
                                    required
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    {canSelectAnyDate 
                                        ? 'You can select any date including past dates' 
                                        : 'The scheduled rest day you want to cancel (future dates only)'}
                                </p>
                            </div>
                            
                            <div>
                                <label htmlFor="replacement_work_date" className="block text-sm font-medium text-gray-700 mb-1">
                                    Replacement Work Date (Optional)
                                </label>
                                <input
                                    type="date"
                                    id="replacement_work_date"
                                    name="replacement_work_date"
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-300 focus:ring focus:ring-red-200 focus:ring-opacity-50"
                                    value={formData.replacement_work_date}
                                    onChange={handleChange}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Optional: When you'll work instead of the cancelled rest day
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-medium mb-3">Reason for Cancellation</h4>
                        
                        <div>
                            <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
                                Reason <span className="text-red-600">*</span>
                            </label>
                            <textarea
                                id="reason"
                                name="reason"
                                rows="5"
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-300 focus:ring focus:ring-red-200 focus:ring-opacity-50"
                                placeholder="Provide a detailed reason for canceling the rest day"
                                value={formData.reason}
                                onChange={handleChange}
                                required
                            ></textarea>
                            <p className="mt-1 text-xs text-gray-500">
                                Please provide a clear justification for canceling the rest day.
                            </p>
                        </div>
                    </div>
                </div>
                
                <div className="px-4 py-3 bg-gray-50 text-right sm:px-6 border-t">
                    <button
                        type="submit"
                        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                        Submit Cancel Rest Day Request
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CancelRestDayForm;