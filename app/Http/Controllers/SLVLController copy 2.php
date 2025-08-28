<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\SLVL;
use App\Models\SLVLBank;
use App\Models\Employee;
use App\Models\DepartmentManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Inertia\Inertia;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class SLVLController extends Controller
{
    /**
     * Display a listing of SLVL requests.
     */
    public function index(Request $request)
    {
        $user = Auth::user();
        $userRoles = $this->getUserRoles($user);
        
        // Get all departments for filtering
        $departments = Employee::select('Department')
            ->distinct()
            ->whereNotNull('Department')
            ->orderBy('Department')
            ->pluck('Department')
            ->toArray();
            
        // Query SLVL based on user role
        $slvlQuery = SLVL::with(['employee', 'approver']);
        
        // Filter based on user roles
        if ($userRoles['isEmployee'] && !$userRoles['isDepartmentManager'] && !$userRoles['isHrdManager'] && !$userRoles['isSuperAdmin']) {
            // Regular employees can only see their own SLVL
            $employeeId = $user->employee ? $user->employee->id : null;
            if ($employeeId) {
                $slvlQuery->where('employee_id', $employeeId);
            }
        } elseif ($userRoles['isDepartmentManager'] && !$userRoles['isSuperAdmin']) {
            // Department managers can see SLVL from their department
            $managedDepartments = DepartmentManager::where('manager_id', $user->id)
                ->pluck('department')
                ->toArray();
                
            $slvlQuery->whereHas('employee', function($q) use ($managedDepartments) {
                $q->whereIn('Department', $managedDepartments);
            });
        }
        // HRD managers and superadmins can see all SLVL
        
        // Sort by latest first
        $slvlQuery->orderBy('created_at', 'desc');
        
        // Get active employees for the form
        $employees = Employee::where('JobStatus', 'Active')
            ->orderBy('Lname')
            ->get()
            ->map(function ($employee) {
                // Get SLVL bank info for current year
                $currentYear = now()->year;
                $sickBank = $employee->slvlBanks()->where('leave_type', 'sick')->where('year', $currentYear)->first();
                $vacationBank = $employee->slvlBanks()->where('leave_type', 'vacation')->where('year', $currentYear)->first();
                
                return [
                    'id' => $employee->id,
                    'idno' => $employee->idno,
                    'name' => "{$employee->Lname}, {$employee->Fname} {$employee->MName}",
                    'department' => $employee->Department,
                    'position' => $employee->Jobtitle,
                    'sick_leave_days' => $sickBank ? $sickBank->remaining_days : 0,
                    'vacation_leave_days' => $vacationBank ? $vacationBank->remaining_days : 0,
                ];
            });
            
        // Leave types with document requirements
        $leaveTypes = [
            ['value' => 'sick', 'label' => 'Sick Leave', 'requires_documents' => true],
            ['value' => 'vacation', 'label' => 'Vacation Leave', 'requires_documents' => false],
            ['value' => 'emergency', 'label' => 'Emergency Leave', 'requires_documents' => true],
            ['value' => 'bereavement', 'label' => 'Bereavement Leave', 'requires_documents' => true],
            ['value' => 'maternity', 'label' => 'Maternity Leave', 'requires_documents' => true],
            ['value' => 'paternity', 'label' => 'Paternity Leave', 'requires_documents' => true],
            ['value' => 'personal', 'label' => 'Personal Leave', 'requires_documents' => false],
            ['value' => 'study', 'label' => 'Study Leave', 'requires_documents' => true],
        ];

        // Pay options
        $payOptions = [
            ['value' => 'with_pay', 'label' => 'With Pay'],
            ['value' => 'non_pay', 'label' => 'Non Pay'],
        ];
        
        // Check if a specific request is selected for viewing
        $selectedId = $request->input('selected');
        $selectedSLVL = null;
        
        if ($selectedId) {
            $selectedSLVL = SLVL::with(['employee', 'approver'])
                ->find($selectedId);
        }
        
        // Get the list of SLVL requests
        $slvls = $slvlQuery->get()->map(function ($slvl) {
            // Get the employee's remaining leave days
            $employee = $slvl->employee;
            $currentYear = now()->year;
            $remainingDays = 0;
            
            if ($employee) {
                $bank = $employee->slvlBanks()
                    ->where('leave_type', $slvl->type)
                    ->where('year', $currentYear)
                    ->first();
                $remainingDays = $bank ? $bank->remaining_days : 0;
            }
            
            return array_merge($slvl->toArray(), [
                'employee_remaining_days' => $remainingDays
            ]);
        });
        
        return inertia('SLVL/SLVLPage', [
            'auth' => [
                'user' => $user,
            ],
            'slvls' => $slvls,
            'employees' => $employees,
            'leaveTypes' => $leaveTypes,
            'payOptions' => $payOptions,
            'departments' => $departments,
            'selectedSLVL' => $selectedSLVL,
            'userRoles' => $userRoles
        ]);
    }

    private function getUserRoles($user)
    {
        // Check department manager directly from database first
        $isDepartmentManager = DepartmentManager::where('manager_id', $user->id)->exists();
        
        // Check if user is an HRD manager
        $isHrdManager = $this->isHrdManager($user);
        
        $userRoles = [
            'isSuperAdmin' => $user->hasRole('superadmin'),
            'isHrdManager' => $isHrdManager,
            'isDepartmentManager' => $isDepartmentManager || $user->hasRole('department_manager'),
            'isEmployee' => $user->is_employee || ($user->employee && $user->employee->exists()),
            'userId' => $user->id,
            'employeeId' => $user->employee ? $user->employee->id : null,
            'managedDepartments' => [],
        ];
        
        // If user is a department manager, get their managed departments
        if ($userRoles['isDepartmentManager']) {
            $userRoles['managedDepartments'] = DepartmentManager::where('manager_id', $user->id)
                ->pluck('department')
                ->toArray();
        }
        
        return $userRoles;
    }


    /**
     * Store a newly created SLVL request.
     */
    public function store(Request $request)
    {
        // Log the incoming request for debugging
        Log::info('SLVL Store Request Data:', [
            'all_data' => $request->all(),
            'files' => $request->allFiles(),
            'method' => $request->method(),
            'content_type' => $request->header('Content-Type')
        ]);

        // Define which leave types require supporting documents
        $leaveTypesRequiringDocuments = ['sick', 'emergency', 'bereavement', 'maternity', 'paternity', 'study'];
        
        // Handle boolean conversion for FormData
        if ($request->has('half_day')) {
            $halfDay = $request->input('half_day');
            if ($halfDay === 'true' || $halfDay === '1' || $halfDay === 1) {
                $request->merge(['half_day' => true]);
            } else {
                $request->merge(['half_day' => false]);
            }
        }

        // Base validation rules
        $validationRules = [
            'employee_id' => 'required|integer|exists:employees,id',
            'type' => 'required|string|in:sick,vacation,emergency,bereavement,maternity,paternity,personal,study',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'half_day' => 'sometimes|boolean',
            'am_pm' => 'nullable|string|in:AM,PM',
            'pay_type' => 'required|string|in:with_pay,non_pay',
            'reason' => 'required|string|max:1000',
        ];

        // Add conditional validation for supporting documents
        if (in_array($request->input('type'), $leaveTypesRequiringDocuments)) {
            $validationRules['supporting_documents'] = 'required|file|mimes:pdf,doc,docx,jpg,jpeg,png|max:5120'; // 5MB max
        } else {
            $validationRules['supporting_documents'] = 'nullable|file|mimes:pdf,doc,docx,jpg,jpeg,png|max:5120'; // 5MB max
        }

        try {
            $validated = $request->validate($validationRules);
            Log::info('SLVL Validation passed:', $validated);
        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::error('SLVL Validation failed:', [
                'errors' => $e->errors(),
                'request_data' => $request->all()
            ]);
            throw $e;
        }
        
        $user = Auth::user();
        
        // Calculate total days
        $startDate = Carbon::parse($validated['start_date']);
        $endDate = Carbon::parse($validated['end_date']);
        
        if ($validated['half_day'] ?? false) {
            $totalDays = 0.5;
        } else {
            $totalDays = $startDate->diffInDays($endDate) + 1;
        }
        
        // Check for overlapping leaves
        $employee = Employee::find($validated['employee_id']);
        if (!$employee) {
            Log::error('Employee not found:', ['employee_id' => $validated['employee_id']]);
            return back()->with('error', 'Employee not found.');
        }

        $hasOverlap = SLVL::where('employee_id', $validated['employee_id'])
            ->where('status', '!=', 'rejected')
            ->where(function($query) use ($startDate, $endDate) {
                $query->where(function($q) use ($startDate, $endDate) {
                    $q->whereBetween('start_date', [$startDate, $endDate])
                      ->orWhereBetween('end_date', [$startDate, $endDate]);
                })->orWhere(function($q) use ($startDate, $endDate) {
                    $q->where('start_date', '<=', $startDate)
                      ->where('end_date', '>=', $endDate);
                });
            })
            ->exists();
            
        if ($hasOverlap) {
            Log::warning('Leave request overlaps detected:', [
                'employee_id' => $validated['employee_id'],
                'start_date' => $startDate,
                'end_date' => $endDate
            ]);
            return back()->with('error', 'Leave request overlaps with existing leave period.');
        }
        
        // Check available leave days for sick and vacation leave (only for with_pay requests)
        if (in_array($validated['type'], ['sick', 'vacation']) && $validated['pay_type'] === 'with_pay') {
            $currentYear = now()->year;
            $bank = SLVLBank::where('employee_id', $validated['employee_id'])
                ->where('leave_type', $validated['type'])
                ->where('year', $currentYear)
                ->first();
                
            if (!$bank) {
                // Create default bank if it doesn't exist
                $bank = SLVLBank::create([
                    'employee_id' => $validated['employee_id'],
                    'leave_type' => $validated['type'],
                    'total_days' => $validated['type'] === 'sick' ? 15 : 15, // Default days
                    'used_days' => 0,
                    'year' => $currentYear,
                    'created_by' => $user->id,
                    'notes' => 'Auto-created default bank'
                ]);
                Log::info('Created default SLVL bank:', ['bank_id' => $bank->id]);
            }
            
            if ($bank->remaining_days < $totalDays) {
                Log::warning('Insufficient leave days:', [
                    'employee_id' => $validated['employee_id'],
                    'type' => $validated['type'],
                    'required_days' => $totalDays,
                    'available_days' => $bank->remaining_days
                ]);
                return back()->with('error', "Insufficient {$validated['type']} leave days. Employee only has {$bank->remaining_days} days available.");
            }
        }
        
        DB::beginTransaction();
        
        try {
            // Handle file upload
            $documentsPath = null;
            if ($request->hasFile('supporting_documents')) {
                $file = $request->file('supporting_documents');
                Log::info('Processing file upload:', [
                    'original_name' => $file->getClientOriginalName(),
                    'size' => $file->getSize(),
                    'mime_type' => $file->getMimeType()
                ]);
                
                $filename = time() . '_' . $file->getClientOriginalName();
                $documentsPath = $file->storeAs('slvl_documents', $filename, 'public');
                
                Log::info('File uploaded successfully:', ['path' => $documentsPath]);
            }
            
            // Create SLVL record
            $slvlData = [
                'employee_id' => $validated['employee_id'],
                'type' => $validated['type'],
                'start_date' => $validated['start_date'],
                'end_date' => $validated['end_date'],
                'half_day' => $validated['half_day'] ?? false,
                'am_pm' => $validated['am_pm'],
                'total_days' => $totalDays,
                'with_pay' => $validated['pay_type'] === 'with_pay',
                'pay_type' => $validated['pay_type'],
                'reason' => $validated['reason'],
                'documents_path' => $documentsPath,
                'status' => 'pending',
                'created_by' => $user->id,
            ];

            Log::info('Creating SLVL record with data:', $slvlData);
            
            $slvl = SLVL::create($slvlData);
            
            if (!$slvl) {
                throw new \Exception('Failed to create SLVL record');
            }
            
            Log::info('SLVL record created successfully:', ['slvl_id' => $slvl->id]);
            
            DB::commit();
            
            // Log the successful creation
            Log::info('SLVL request created successfully', [
                'slvl_id' => $slvl->id,
                'employee_id' => $validated['employee_id'],
                'user_id' => $user->id,
                'type' => $validated['type'],
                'pay_type' => $validated['pay_type'],
                'total_days' => $totalDays
            ]);
            
            // Get fresh data for redirect
            $userRoles = $this->getUserRoles($user);
            $slvls = $this->getFilteredSLVLs($user);
            
            // Redirect back with success message and fresh data
            return redirect()->route('slvl.index')->with([
                'message' => 'SLVL request created successfully',
                'slvls' => $slvls
            ]);
            
        } catch (\Exception $e) {
            DB::rollBack();
            
            // Clean up uploaded file if database save failed
            if ($documentsPath && Storage::disk('public')->exists($documentsPath)) {
                Storage::disk('public')->delete($documentsPath);
                Log::info('Cleaned up uploaded file after database error:', ['path' => $documentsPath]);
            }
            
            // Log the error
            Log::error('Error creating SLVL request', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'user_id' => $user->id,
                'employee_id' => $validated['employee_id'] ?? null,
                'validated_data' => $validated
            ]);
            
            return back()->with('error', 'Error creating SLVL request: ' . $e->getMessage());
        }
    }


    /**
 * Update the status of an SLVL request.
 */
public function updateStatus(Request $request, $id)
{
    $user = Auth::user();
    $slvl = SLVL::findOrFail($id);
    
    $validated = $request->validate([
        'status' => 'required|in:approved,rejected,force_approved',
        'remarks' => 'nullable|string|max:500',
    ]);

    // Check permission
    $canUpdate = false;
    $isForceApproval = $validated['status'] === 'force_approved';
    
    $userRoles = $this->getUserRoles($user);
    
    // Only superadmin can force approve
    if ($isForceApproval && $userRoles['isSuperAdmin']) {
        $canUpdate = true;
        $validated['status'] = 'approved';
    }
    // Department manager can approve/reject for their department
    elseif ($userRoles['isDepartmentManager'] && 
        in_array($slvl->employee->Department, $userRoles['managedDepartments']) &&
        !$isForceApproval) {
        $canUpdate = true;
    }
    // HRD manager or superadmin can approve/reject any request
    elseif (($userRoles['isHrdManager'] || $userRoles['isSuperAdmin']) && !$isForceApproval) {
        $canUpdate = true;
    }

    if (!$canUpdate) {
        return redirect()->back()->with('error', 'You are not authorized to update this SLVL request.');
    }

    DB::beginTransaction();
    
    try {
        if ($isForceApproval) {
            $slvl->remarks = 'Administrative override: ' . ($validated['remarks'] ?? 'Force approved by admin');
        } else {
            $slvl->remarks = $validated['remarks'];
        }
        
        $oldStatus = $slvl->status;
        $slvl->status = $validated['status'];
        $slvl->approved_by = $user->id;
        $slvl->approved_at = now();
        $slvl->save();
        
        // Update SLVL bank if approved and with_pay
        if ($slvl->status === 'approved' && $oldStatus !== 'approved' && $slvl->with_pay) {
            if (in_array($slvl->type, ['sick', 'vacation'])) {
                $currentYear = now()->year;
                $bank = SLVLBank::where('employee_id', $slvl->employee_id)
                    ->where('leave_type', $slvl->type)
                    ->where('year', $currentYear)
                    ->first();
                
                if (!$bank) {
                    $bank = SLVLBank::create([
                        'employee_id' => $slvl->employee_id,
                        'leave_type' => $slvl->type,
                        'total_days' => $slvl->type === 'sick' ? 15 : 15,
                        'used_days' => 0,
                        'year' => $currentYear,
                        'created_by' => $user->id,
                        'notes' => 'Auto-created bank'
                    ]);
                }
                
                if ($bank->remaining_days < $slvl->total_days) {
                    DB::rollBack();
                    return redirect()->back()->with('error', 'Insufficient days in SLVL bank. Employee only has ' . $bank->remaining_days . ' days available.');
                }
                
                $bank->used_days += $slvl->total_days;
                $bank->save();
            }
        }
        
        // Undo bank update if status changed from approved to something else
        if ($oldStatus === 'approved' && $slvl->status !== 'approved' && $slvl->with_pay) {
            if (in_array($slvl->type, ['sick', 'vacation'])) {
                $currentYear = now()->year;
                $bank = SLVLBank::where('employee_id', $slvl->employee_id)
                    ->where('leave_type', $slvl->type)
                    ->where('year', $currentYear)
                    ->first();
                
                if ($bank) {
                    $bank->used_days -= $slvl->total_days;
                    $bank->save();
                }
            }
        }

        DB::commit();
        
        return redirect()->back()->with('message', 'SLVL status updated successfully.');
        
    } catch (\Exception $e) {
        DB::rollBack();
        return redirect()->back()->with('error', 'Failed to update SLVL status: ' . $e->getMessage());
    }
}


/**
 * Get employees with SLVL bank data for a specific year
 */
public function getEmployeesWithBankData(Request $request)
{
    $year = $request->input('year', now()->year);
    
    // Get active employees
    $employees = Employee::where('JobStatus', 'Active')
        ->orderBy('Lname')
        ->get()
        ->map(function ($employee) use ($year) {
            // Get SLVL bank info for specified year
            $sickBank = $employee->slvlBanks()
                ->where('leave_type', 'sick')
                ->where('year', $year)
                ->first();
            $vacationBank = $employee->slvlBanks()
                ->where('leave_type', 'vacation')
                ->where('year', $year)
                ->first();
            
            return [
                'id' => $employee->id,
                'idno' => $employee->idno,
                'name' => "{$employee->Lname}, {$employee->Fname} {$employee->MName}",
                'department' => $employee->Department,
                'position' => $employee->Jobtitle,
                'sick_leave_days' => $sickBank ? $sickBank->remaining_days : 0,
                'vacation_leave_days' => $vacationBank ? $vacationBank->remaining_days : 0,
            ];
        });
        
    return response()->json([
        'employees' => $employees,
        'year' => $year
    ]);
}

    /**
     * Bulk update the status of multiple SLVL requests.
     */
    public function bulkUpdateStatus(Request $request)
    {
        $user = Auth::user();
        
        $validated = $request->validate([
            'slvl_ids' => 'required|array',
            'slvl_ids.*' => 'required|integer|exists:slvl,id',
            'status' => 'required|in:approved,rejected,force_approved',
            'remarks' => 'nullable|string|max:500',
        ]);
        
        $successCount = 0;
        $failCount = 0;
        $errors = [];
        
        DB::beginTransaction();
        
        try {
            foreach ($validated['slvl_ids'] as $slvlId) {
                $slvl = SLVL::findOrFail($slvlId);
                
                // Check permission
                $canUpdate = false;
                $userRoles = $this->getUserRoles($user);
                
                if ($validated['status'] === 'force_approved' && $userRoles['isSuperAdmin']) {
                    $canUpdate = true;
                } elseif ($userRoles['isDepartmentManager'] && 
                    in_array($slvl->employee->Department, $userRoles['managedDepartments']) &&
                    $validated['status'] !== 'force_approved') {
                    $canUpdate = true;
                } elseif (($userRoles['isHrdManager'] || $userRoles['isSuperAdmin']) && 
                    $validated['status'] !== 'force_approved') {
                    $canUpdate = true;
                }
                
                if (!$canUpdate) {
                    $failCount++;
                    $errors[] = "Not authorized to update SLVL request #{$slvlId}";
                    continue;
                }
                
                $oldStatus = $slvl->status;
                
                if ($validated['status'] === 'force_approved') {
                    $slvl->status = 'approved';
                    $slvl->remarks = 'Administrative override: ' . ($validated['remarks'] ?? 'Force approved by admin');
                } else {
                    $slvl->status = $validated['status'];
                    $slvl->remarks = $validated['remarks'] ?? 'Bulk ' . $validated['status'];
                }
                $slvl->approved_by = $user->id;
                $slvl->approved_at = now();
                $slvl->save();
                
                // Update SLVL bank if approved and with_pay
                if ($slvl->status === 'approved' && $oldStatus !== 'approved' && $slvl->with_pay) {
                    if (in_array($slvl->type, ['sick', 'vacation'])) {
                        $currentYear = now()->year;
                        $bank = SLVLBank::where('employee_id', $slvl->employee_id)
                            ->where('leave_type', $slvl->type)
                            ->where('year', $currentYear)
                            ->first();
                        
                        if (!$bank) {
                            $bank = SLVLBank::create([
                                'employee_id' => $slvl->employee_id,
                                'leave_type' => $slvl->type,
                                'total_days' => $slvl->type === 'sick' ? 15 : 15,
                                'used_days' => 0,
                                'year' => $currentYear,
                                'created_by' => $user->id,
                                'notes' => 'Auto-created bank'
                            ]);
                        }
                        
                        if ($bank->remaining_days < $slvl->total_days) {
                            $errors[] = "SLVL #{$slvlId}: Insufficient days in SLVL bank. Employee only has " . $bank->remaining_days . " days available.";
                            $failCount++;
                            continue;
                        }
                        
                        $bank->used_days += $slvl->total_days;
                        $bank->save();
                    }
                }
                
                $successCount++;
            }
            
            DB::commit();
            
            $message = "{$successCount} SLVL requests updated successfully.";
            if ($failCount > 0) {
                $message .= " {$failCount} updates failed.";
            }
            
            return redirect()->back()->with([
                'message' => $message,
                'errors' => $errors
            ]);
            
        } catch (\Exception $e) {
            DB::rollBack();
            return redirect()->back()->with('error', 'Error updating SLVL statuses: ' . $e->getMessage());
        }
    }

    private function getFilteredSLVLs($user)
    {
        $userRoles = $this->getUserRoles($user);
        
        $slvlQuery = SLVL::with(['employee', 'approver']);
        
        // Filter based on user roles
        if ($userRoles['isEmployee'] && !$userRoles['isDepartmentManager'] && !$userRoles['isHrdManager'] && !$userRoles['isSuperAdmin']) {
            $employeeId = $user->employee ? $user->employee->id : null;
            if ($employeeId) {
                $slvlQuery->where('employee_id', $employeeId);
            }
        } elseif ($userRoles['isDepartmentManager'] && !$userRoles['isSuperAdmin']) {
            $managedDepartments = DepartmentManager::where('manager_id', $user->id)
                ->pluck('department')
                ->toArray();
                
            $slvlQuery->whereHas('employee', function($q) use ($managedDepartments) {
                $q->whereIn('Department', $managedDepartments);
            });
        }
        
        $slvls = $slvlQuery->orderBy('created_at', 'desc')->get();
        
        // Add remaining days to each SLVL
        return $slvls->map(function ($slvl) {
            $employee = $slvl->employee;
            $currentYear = now()->year;
            $remainingDays = 0;
            
            if ($employee && in_array($slvl->type, ['sick', 'vacation'])) {
                $bank = $employee->slvlBanks()
                    ->where('leave_type', $slvl->type)
                    ->where('year', $currentYear)
                    ->first();
                $remainingDays = $bank ? $bank->remaining_days : 0;
            }
            
            return array_merge($slvl->toArray(), [
                'employee_remaining_days' => $remainingDays
            ]);
        });
    }

    public function destroy($id)
    {
        $user = Auth::user();
        $slvl = SLVL::findOrFail($id);
        
        // Only allow deletion if status is pending and user has permission
        if ($slvl->status !== 'pending') {
            return back()->with('error', 'Only pending SLVL requests can be deleted');
        }
        
        $userRoles = $this->getUserRoles($user);
        $canDelete = false;
        
        // Check permissions
        if ($userRoles['isSuperAdmin']) {
            $canDelete = true;
        } elseif ($slvl->employee_id === $userRoles['employeeId']) {
            $canDelete = true;
        } elseif ($userRoles['isDepartmentManager'] && 
                in_array($slvl->employee->Department, $userRoles['managedDepartments'])) {
            $canDelete = true;
        } elseif ($userRoles['isHrdManager']) {
            $canDelete = true;
        }
        
        if (!$canDelete) {
            return back()->with('error', 'You are not authorized to delete this SLVL request');
        }
        
        try {
            $slvl->delete();
            return back()->with('message', 'SLVL request deleted successfully');
        } catch (\Exception $e) {
            return back()->with('error', 'Failed to delete SLVL request: ' . $e->getMessage());
        }
    }

    /**
     * Export SLVL requests to Excel.
     */
    public function export(Request $request)
    {
        $filterStatus = $request->input('status');
        $searchTerm = $request->input('search');
        $fromDate = $request->input('from_date');
        $toDate = $request->input('to_date');
        
        $user = Auth::user();
        $userRoles = $this->getUserRoles($user);
        
        $slvlQuery = SLVL::with(['employee', 'approver']);
        
        // Apply role-based filtering
        if ($userRoles['isEmployee'] && !$userRoles['isDepartmentManager'] && !$userRoles['isHrdManager'] && !$userRoles['isSuperAdmin']) {
            $employeeId = $user->employee ? $user->employee->id : null;
            if ($employeeId) {
                $slvlQuery->where('employee_id', $employeeId);
            }
        } elseif ($userRoles['isDepartmentManager'] && !$userRoles['isSuperAdmin']) {
            $managedDepartments = DepartmentManager::where('manager_id', $user->id)
                ->pluck('department')
                ->toArray();
                
            $slvlQuery->whereHas('employee', function($q) use ($managedDepartments) {
                $q->whereIn('Department', $managedDepartments);
            });
        }
        
        // Apply filters
        if ($filterStatus) {
            $slvlQuery->where('status', $filterStatus);
        }
        
        if ($searchTerm) {
            $slvlQuery->where(function($query) use ($searchTerm) {
                $query->whereHas('employee', function($q) use ($searchTerm) {
                    $q->where('Fname', 'like', "%{$searchTerm}%")
                      ->orWhere('Lname', 'like', "%{$searchTerm}%")
                      ->orWhere('idno', 'like', "%{$searchTerm}%")
                      ->orWhere('Department', 'like', "%{$searchTerm}%");
                })
                ->orWhere('reason', 'like', "%{$searchTerm}%");
            });
        }
        
        if ($fromDate) {
            $slvlQuery->whereDate('start_date', '>=', $fromDate);
        }
        
        if ($toDate) {
            $slvlQuery->whereDate('end_date', '<=', $toDate);
        }
        
        $slvls = $slvlQuery->orderBy('created_at', 'desc')->get();
        
        // Create Excel file
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        
        // Set headers
        $sheet->setCellValue('A1', 'ID');
        $sheet->setCellValue('B1', 'Employee ID');
        $sheet->setCellValue('C1', 'Employee Name');
        $sheet->setCellValue('D1', 'Department');
        $sheet->setCellValue('E1', 'Leave Type');
        $sheet->setCellValue('F1', 'Start Date');
        $sheet->setCellValue('G1', 'End Date');
        $sheet->setCellValue('H1', 'Total Days');
        $sheet->setCellValue('I1', 'Half Day');
        $sheet->setCellValue('J1', 'AM/PM');
        $sheet->setCellValue('K1', 'Pay Type');
        $sheet->setCellValue('L1', 'Reason');
        $sheet->setCellValue('M1', 'Status');
        $sheet->setCellValue('N1', 'Approved By');
        $sheet->setCellValue('O1', 'Approved Date');
        $sheet->setCellValue('P1', 'Remarks');
        $sheet->setCellValue('Q1', 'Created Date');
        
        // Add data
        $row = 2;
        foreach ($slvls as $slvl) {
            $sheet->setCellValue('A' . $row, $slvl->id);
            $sheet->setCellValue('B' . $row, $slvl->employee ? $slvl->employee->idno : '');
            $sheet->setCellValue('C' . $row, $slvl->employee ? $slvl->employee->Lname . ', ' . $slvl->employee->Fname : '');
            $sheet->setCellValue('D' . $row, $slvl->employee ? $slvl->employee->Department : '');
            $sheet->setCellValue('E' . $row, ucfirst($slvl->type));
            $sheet->setCellValue('F' . $row, $slvl->start_date ? Carbon::parse($slvl->start_date)->format('Y-m-d') : '');
            $sheet->setCellValue('G' . $row, $slvl->end_date ? Carbon::parse($slvl->end_date)->format('Y-m-d') : '');
            $sheet->setCellValue('H' . $row, $slvl->total_days);
            $sheet->setCellValue('I' . $row, $slvl->half_day ? 'Yes' : 'No');
            $sheet->setCellValue('J' . $row, $slvl->am_pm ?? '');
            $sheet->setCellValue('K' . $row, $slvl->pay_type ? ucfirst(str_replace('_', ' ', $slvl->pay_type)) : ($slvl->with_pay ? 'With Pay' : 'Non Pay'));
            $sheet->setCellValue('L' . $row, $slvl->reason);
            $sheet->setCellValue('M' . $row, ucfirst($slvl->status));
            $sheet->setCellValue('N' . $row, $slvl->approver ? $slvl->approver->name : '');
            $sheet->setCellValue('O' . $row, $slvl->approved_at ? Carbon::parse($slvl->approved_at)->format('Y-m-d H:i:s') : '');
            $sheet->setCellValue('P' . $row, $slvl->remarks);
            $sheet->setCellValue('Q' . $row, $slvl->created_at ? Carbon::parse($slvl->created_at)->format('Y-m-d H:i:s') : '');
            $row++;
        }
        
        // Auto-size columns
        foreach (range('A', 'Q') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }
        
        // Create writer and save
        $writer = new Xlsx($spreadsheet);
        $filename = 'SLVL_Requests_' . date('Y-m-d_H-i-s') . '.xlsx';
        
        $tempFile = tempnam(sys_get_temp_dir(), 'slvl_export_');
        $writer->save($tempFile);
        
        return response()->download($tempFile, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend(true);
    }

    /**
     * Force approve SLVL requests (admin only).
     */
    public function forceApprove(Request $request)
    {
        if (!$this->isSuperAdmin(Auth::user())) {
            return back()->with('error', 'Only administrators can force approve SLVL requests.');
        }
        
        $validated = $request->validate([
            'slvl_ids' => 'required|array',
            'slvl_ids.*' => 'required|integer|exists:slvl,id',
            'remarks' => 'nullable|string|max:500',
        ]);
        
        $user = Auth::user();
        $remarks = $validated['remarks'] ?? 'Administrative override: Force approved by admin';
        $successCount = 0;
        $failCount = 0;
        $errors = [];
        
        \Log::info('Force approval of SLVL initiated', [
            'admin_id' => $user->id,
            'admin_name' => $user->name,
            'count' => count($validated['slvl_ids'])
        ]);
        
        DB::beginTransaction();
        
        try {
            foreach ($validated['slvl_ids'] as $slvlId) {
                $slvl = SLVL::findOrFail($slvlId);
                
                if ($slvl->status === 'approved') {
                    $errors[] = "SLVL #{$slvlId} is already approved";
                    $failCount++;
                    continue;
                }
                
                $oldStatus = $slvl->status;
                
                $slvl->status = 'approved';
                $slvl->approved_by = $user->id;
                $slvl->approved_at = now();
                $slvl->remarks = 'Administrative override: ' . $remarks;
                $slvl->save();
                
                // Update SLVL bank only for with_pay requests
                if ($oldStatus !== 'approved' && $slvl->with_pay && in_array($slvl->type, ['sick', 'vacation'])) {
                    $currentYear = now()->year;
                    $bank = SLVLBank::where('employee_id', $slvl->employee_id)
                        ->where('leave_type', $slvl->type)
                        ->where('year', $currentYear)
                        ->first();
                    
                    if (!$bank) {
                        $bank = SLVLBank::create([
                            'employee_id' => $slvl->employee_id,
                            'leave_type' => $slvl->type,
                            'total_days' => $slvl->type === 'sick' ? 15 : 15,
                            'used_days' => 0,
                            'year' => $currentYear,
                            'created_by' => $user->id,
                            'notes' => 'Auto-created bank (force approved)'
                        ]);
                    }
                    
                    if ($bank->remaining_days < $slvl->total_days) {
                        $errors[] = "SLVL #{$slvlId}: Insufficient days in SLVL bank. Employee only has " . $bank->remaining_days . " days available.";
                        
                        $slvl->status = $oldStatus;
                        $slvl->approved_by = null;
                        $slvl->approved_at = null;
                        $slvl->remarks = null;
                        $slvl->save();
                        
                        $failCount++;
                        continue;
                    }
                    
                    $bank->used_days += $slvl->total_days;
                    $bank->notes = "Used for SLVL ID {$slvl->id} (force approved)";
                    $bank->save();
                }
                
                $successCount++;
                
                \Log::info("Force approved SLVL #{$slvlId}", [
                    'admin_id' => $user->id,
                    'slvl_id' => $slvlId,
                    'previous_status' => $oldStatus
                ]);
            }
            
            DB::commit();
            
            $message = "{$successCount} SLVL requests force approved successfully.";
            if ($failCount > 0) {
                $message .= " {$failCount} force approvals failed.";
            }
            
            return back()->with([
                'message' => $message,
                'errors' => $errors
            ]);
            
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error("Error during SLVL force approval: " . $e->getMessage());
            return back()->with('error', 'Error during force approval: ' . $e->getMessage());
        }
    }
    
    /**
     * Add days directly to an employee's SLVL bank.
     */
    public function addDaysToBank(Request $request)
    {
        $user = Auth::user();
        $userRoles = $this->getUserRoles($user);
        
        if (!$userRoles['isHrdManager'] && !$userRoles['isSuperAdmin']) {
            return back()->with('error', 'You are not authorized to perform this action.');
        }
        
        $validated = $request->validate([
            'employee_id' => 'required|integer|exists:employees,id',
            'leave_type' => 'required|string|in:sick,vacation',
            'days' => 'required|numeric|min:0.5|max:365',
            'year' => 'required|integer|min:2020|max:2030',
            'notes' => 'nullable|string|max:500',
        ]);
        
        DB::beginTransaction();
        
        try {
            $employee = Employee::find($validated['employee_id']);
            
            // Get or create SLVL bank
            $bank = SLVLBank::where('employee_id', $validated['employee_id'])
                ->where('leave_type', $validated['leave_type'])
                ->where('year', $validated['year'])
                ->first();
            
            if (!$bank) {
                $bank = SLVLBank::create([
                    'employee_id' => $validated['employee_id'],
                    'leave_type' => $validated['leave_type'],
                    'total_days' => $validated['days'],
                    'used_days' => 0,
                    'year' => $validated['year'],
                    'created_by' => $user->id,
                    'notes' => $validated['notes'] ?? "Manual addition by {$user->name}"
                ]);
            } else {
                $bank->total_days += $validated['days'];
                $bank->notes = ($bank->notes ? $bank->notes . "\n" : '') . 
                              (now()->format('Y-m-d H:i') . " - Added {$validated['days']} days by {$user->name}" . 
                              ($validated['notes'] ? ": {$validated['notes']}" : ''));
                $bank->save();
            }
            
            DB::commit();
            
            // Return redirect with success message instead of JSON
            return back()->with('message', "Successfully added {$validated['days']} {$validated['leave_type']} leave days to {$employee->Fname} {$employee->Lname}'s bank for year {$validated['year']}.");
            
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->with('error', 'Failed to add days to SLVL bank: ' . $e->getMessage());
        }
    }
    
    /**
     * Get the SLVL bank details for an employee.
     */
    public function getSLVLBank($employeeId)
    {
        $employee = Employee::findOrFail($employeeId);
        $currentYear = request('year', now()->year); // Allow year parameter
        
        $sickBank = SLVLBank::where('employee_id', $employeeId)
            ->where('leave_type', 'sick')
            ->where('year', $currentYear)
            ->first();
            
        $vacationBank = SLVLBank::where('employee_id', $employeeId)
            ->where('leave_type', 'vacation')
            ->where('year', $currentYear)
            ->first();
        
        return response()->json([
            'employee' => [
                'id' => $employee->id,
                'name' => "{$employee->Lname}, {$employee->Fname}",
                'department' => $employee->Department,
            ],
            'slvl_banks' => [
                'sick' => $sickBank ? [
                    'total_days' => $sickBank->total_days,
                    'used_days' => $sickBank->used_days,
                    'remaining_days' => $sickBank->remaining_days,
                    'year' => $sickBank->year,
                    'notes' => $sickBank->notes,
                ] : [
                    'total_days' => 0,
                    'used_days' => 0,
                    'remaining_days' => 0,
                    'year' => $currentYear,
                    'notes' => null,
                ],
                'vacation' => $vacationBank ? [
                    'total_days' => $vacationBank->total_days,
                    'used_days' => $vacationBank->used_days,
                    'remaining_days' => $vacationBank->remaining_days,
                    'year' => $vacationBank->year,
                    'notes' => $vacationBank->notes,
                ] : [
                    'total_days' => 0,
                    'used_days' => 0,
                    'remaining_days' => 0,
                    'year' => $currentYear,
                    'notes' => null,
                ]
            ]
        ]);
    }

    public function bulkAddDaysToBank(Request $request)
    {
        $user = Auth::user();
        $userRoles = $this->getUserRoles($user);
        
        if (!$userRoles['isHrdManager'] && !$userRoles['isSuperAdmin']) {
            return back()->with('error', 'You are not authorized to perform this action.');
        }
        
        $validated = $request->validate([
            'employee_ids' => 'required|array|min:1',
            'employee_ids.*' => 'required|integer|exists:employees,id',
            'leave_type' => 'required|string|in:sick,vacation',
            'days' => 'required|numeric|min:0.5|max:365',
            'year' => 'required|integer|min:2020|max:2030',
            'notes' => 'nullable|string|max:500',
        ]);
        
        DB::beginTransaction();
        
        $successCount = 0;
        $errorCount = 0;
        $errors = [];
        
        try {
            foreach ($validated['employee_ids'] as $employeeId) {
                try {
                    $employee = Employee::find($employeeId);
                    
                    if (!$employee) {
                        $errorCount++;
                        $errors[] = "Employee with ID {$employeeId} not found";
                        continue;
                    }
                    
                    // Get or create SLVL bank
                    $bank = SLVLBank::where('employee_id', $employeeId)
                        ->where('leave_type', $validated['leave_type'])
                        ->where('year', $validated['year'])
                        ->first();
                    
                    if (!$bank) {
                        $bank = SLVLBank::create([
                            'employee_id' => $employeeId,
                            'leave_type' => $validated['leave_type'],
                            'total_days' => $validated['days'],
                            'used_days' => 0,
                            'year' => $validated['year'],
                            'created_by' => $user->id,
                            'notes' => $validated['notes'] ?? "Bulk addition by {$user->name} for {$employee->Fname} {$employee->Lname}"
                        ]);
                    } else {
                        $bank->total_days += $validated['days'];
                        $bank->notes = ($bank->notes ? $bank->notes . "\n" : '') . 
                                      (now()->format('Y-m-d H:i') . " - Bulk added {$validated['days']} days by {$user->name}" . 
                                      ($validated['notes'] ? ": {$validated['notes']}" : ''));
                        $bank->save();
                    }
                    
                    $successCount++;
                    
                } catch (\Exception $e) {
                    $errorCount++;
                    $errors[] = "Error for employee {$employee->Fname} {$employee->Lname}: " . $e->getMessage();
                    \Log::error("Bulk add SLVL days error for employee {$employeeId}: " . $e->getMessage());
                }
            }
            
            DB::commit();
            
            // Prepare response message
            $message = "Successfully added {$validated['days']} {$validated['leave_type']} leave days to {$successCount} employee(s)";
            if ($errorCount > 0) {
                $message .= ". {$errorCount} errors occurred.";
            }
            
            return back()->with([
                'message' => $message,
                'errors' => $errors
            ]);
            
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Bulk add SLVL days failed: ' . $e->getMessage());
            return back()->with('error', 'Failed to bulk add days to SLVL bank: ' . $e->getMessage());
        }
    }
    
    private function isSuperAdmin($user)
    {
        if (method_exists($user, 'roles') && $user->roles && $user->roles->count() > 0) {
            if ($user->roles->contains('name', 'superadmin') || $user->roles->contains('slug', 'superadmin')) {
                return true;
            }
        }
        
        if (method_exists($user, 'hasRole') && $user->hasRole('superadmin')) {
            return true;
        }
        
        return false;
    }

    private function isHrdManager($user)
    {
        if (method_exists($user, 'roles') && $user->roles && $user->roles->count() > 0) {
            if ($user->roles->contains('name', 'hrd_manager') || $user->roles->contains('slug', 'hrd')) {
                return true;
            }
        }
        
        if (method_exists($user, 'hasRole') && $user->hasRole('hrd_manager')) {
            return true;
        }
        
        return false;
    }
}