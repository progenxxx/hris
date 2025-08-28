<?php

namespace App\Http\Controllers;

use App\Models\EmployeeSchedule;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class EmployeeScheduleController extends Controller
{
    public function index(Request $request)
    {
        Log::info('EmployeeScheduleController@index - Starting employee scheduling page load', [
            'user_id' => auth()->id(),
            'user_email' => auth()->user()->email ?? 'Unknown',
            'request_ip' => $request->ip(),
            'user_agent' => $request->userAgent()
        ]);

        try {
            // Check if employee_schedules table exists
            $tableExists = DB::getSchemaBuilder()->hasTable('employee_schedules');
            Log::info('Table existence check', ['employee_schedules_exists' => $tableExists]);

            if (!$tableExists) {
                Log::error('employee_schedules table does not exist');
                return Inertia::render('Scheduling/EmployeeScheduling', [
                    'employees' => [],
                    'auth' => ['user' => auth()->user()],
                    'error' => 'Database table not found. Please contact administrator.'
                ]);
            }

            $employees = Employee::select('id', 'idno', 'Fname', 'Lname', 'Department')
                ->where('JobStatus', 'Active')
                ->orderBy('Fname')
                ->get();

            Log::info('EmployeeScheduleController@index - Successfully loaded employee scheduling page', [
                'user_id' => auth()->id(),
                'employees_count' => $employees->count(),
                'execution_time' => microtime(true) - LARAVEL_START
            ]);

            return Inertia::render('Scheduling/EmployeeScheduling', [
                'employees' => $employees,
                'auth' => [
                    'user' => auth()->user()
                ]
            ]);

        } catch (\Exception $e) {
            Log::error('EmployeeScheduleController@index - Failed to load employee scheduling page', [
                'user_id' => auth()->id(),
                'error_message' => $e->getMessage(),
                'error_file' => $e->getFile(),
                'error_line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return Inertia::render('Scheduling/EmployeeScheduling', [
                'employees' => [],
                'auth' => ['user' => auth()->user()],
                'error' => 'Failed to load page: ' . $e->getMessage()
            ]);
        }
    }

    public function store(Request $request)
    {
        Log::info('EmployeeScheduleController@store - Creating new employee schedule', [
            'user_id' => auth()->id(),
            'request_data' => $request->all()
        ]);

        try {
            // Handle backward compatibility: convert single employee_id to employee_ids array
            if ($request->has('employee_id') && !$request->has('employee_ids')) {
                $request->merge(['employee_ids' => [$request->employee_id]]);
            }
            
            $validator = Validator::make($request->all(), [
                'employee_ids' => 'required|array|min:1',
                'employee_ids.*' => 'required|exists:employees,id',
                'shift_type' => 'required|in:regular,night,flexible,rotating',
                'work_days' => 'required|array|min:1',
                'work_days.*' => 'in:monday,tuesday,wednesday,thursday,friday,saturday,sunday',
                'start_time' => 'required|date_format:H:i',
                'end_time' => 'required|date_format:H:i|after:start_time',
                'break_start' => 'nullable|date_format:H:i',
                'break_end' => 'nullable|date_format:H:i|after:break_start',
                'effective_date' => 'required|date',
                'end_date' => 'nullable|date|after:effective_date',
                'status' => 'in:active,inactive,pending',
                'notes' => 'nullable|string|max:500'
            ], [
                'end_time.after' => 'End time must be after start time.',
                'break_end.after' => 'Break end time must be after break start time.'
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => $validator->errors()
                ], 422);
            }

            DB::beginTransaction();

            // Check for existing schedules that would conflict for each employee
            $conflictingEmployees = [];
            foreach ($request->employee_ids as $employeeId) {
                $existingSchedules = EmployeeSchedule::where('employee_id', $employeeId)
                    ->whereIn('work_day', $request->work_days)
                    ->where('effective_date', '<=', $request->effective_date)
                    ->where(function($q) use ($request) {
                        $q->whereNull('end_date')
                          ->orWhere('end_date', '>=', $request->effective_date);
                    })
                    ->where('status', '!=', 'inactive')
                    ->get();

                if ($existingSchedules->count() > 0) {
                    $employee = Employee::find($employeeId);
                    $conflictingEmployees[] = [
                        'employee_name' => $employee->Fname . ' ' . $employee->Lname,
                        'employee_id' => $employee->idno,
                        'conflicts' => $existingSchedules->pluck('work_day')->toArray()
                    ];
                }
            }

            if (count($conflictingEmployees) > 0) {
                DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Conflicting schedules found for some employees',
                    'conflicts' => $conflictingEmployees
                ], 422);
            }

            // Create individual schedule records for each employee and each work day
            $createdSchedules = [];
            foreach ($request->employee_ids as $employeeId) {
                foreach ($request->work_days as $workDay) {
                    $scheduleData = [
                        'employee_id' => $employeeId,
                        'shift_type' => $request->shift_type,
                        'work_day' => $workDay,
                        'start_time' => $request->start_time,
                        'end_time' => $request->end_time,
                        'break_start' => $request->break_start,
                        'break_end' => $request->break_end,
                        'effective_date' => $request->effective_date,
                        'end_date' => $request->end_date,
                        'status' => $request->status ?? 'active',
                        'notes' => $request->notes,
                        'created_by' => auth()->id()
                    ];

                    $schedule = EmployeeSchedule::create($scheduleData);
                    $createdSchedules[] = $schedule;
                }
            }

            DB::commit();

            Log::info('EmployeeScheduleController@store - Successfully created employee schedules', [
                'user_id' => auth()->id(),
                'employee_ids' => $request->employee_ids,
                'employee_count' => count($request->employee_ids),
                'schedules_created' => count($createdSchedules),
                'work_days' => $request->work_days
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Employee schedules created successfully for ' . count($request->employee_ids) . ' employee(s)',
                'schedules' => $createdSchedules,
                'total_created' => count($createdSchedules),
                'employees_count' => count($request->employee_ids)
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            
            Log::error('EmployeeScheduleController@store - Error creating employee schedule', [
                'user_id' => auth()->id(),
                'error_message' => $e->getMessage(),
                'error_file' => $e->getFile(),
                'error_line' => $e->getLine(),
                'request_data' => $request->all(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to create employee schedule: ' . $e->getMessage()
            ], 500);
        }
    }

    public function update(Request $request, $id)
    {
        Log::info('EmployeeScheduleController@update - Updating employee schedule', [
            'user_id' => auth()->id(),
            'schedule_id' => $id,
            'request_data' => $request->all()
        ]);

        try {
            $validator = Validator::make($request->all(), [
                'shift_type' => 'required|in:regular,night,flexible,rotating',
                'work_days' => 'required|array|min:1',
                'work_days.*' => 'in:monday,tuesday,wednesday,thursday,friday,saturday,sunday',
                'start_time' => 'required|date_format:H:i:s',
                'end_time' => 'required|date_format:H:i:s|after:start_time',
                'break_start' => 'nullable|date_format:H:i:s',
                'break_end' => 'nullable|date_format:H:i:s|after:break_start',
                'effective_date' => 'required|date',
                'end_date' => 'nullable|date|after:effective_date',
                'status' => 'in:active,inactive,pending',
                'notes' => 'nullable|string|max:500'
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => $validator->errors()
                ], 422);
            }

            // Find the representative schedule record
            $schedule = EmployeeSchedule::findOrFail($id);
            
            DB::beginTransaction();

            // Delete all existing schedules for this employee and effective date
            EmployeeSchedule::where('employee_id', $schedule->employee_id)
                ->where('effective_date', $schedule->effective_date)
                ->delete();

            // Create new schedule records for the updated days
            $updatedSchedules = [];
            foreach ($request->work_days as $workDay) {
                $scheduleData = [
                    'employee_id' => $schedule->employee_id,
                    'shift_type' => $request->shift_type,
                    'work_day' => $workDay,
                    'start_time' => $request->start_time,
                    'end_time' => $request->end_time,
                    'break_start' => $request->break_start,
                    'break_end' => $request->break_end,
                    'effective_date' => $request->effective_date,
                    'end_date' => $request->end_date,
                    'status' => $request->status ?? $schedule->status,
                    'notes' => $request->notes,
                    'updated_by' => auth()->id()
                ];

                $newSchedule = EmployeeSchedule::create($scheduleData);
                $updatedSchedules[] = $newSchedule;
            }

            DB::commit();

            Log::info('EmployeeScheduleController@update - Successfully updated employee schedule', [
                'user_id' => auth()->id(),
                'original_schedule_id' => $id,
                'employee_id' => $schedule->employee_id,
                'schedules_updated' => count($updatedSchedules),
                'work_days' => $request->work_days
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Employee schedule updated successfully',
                'schedules' => $updatedSchedules,
                'total_updated' => count($updatedSchedules)
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            
            Log::error('EmployeeScheduleController@update - Error updating employee schedule', [
                'user_id' => auth()->id(),
                'schedule_id' => $id,
                'error_message' => $e->getMessage(),
                'error_file' => $e->getFile(),
                'error_line' => $e->getLine(),
                'request_data' => $request->all(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to update employee schedule: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Delete employee schedule (deletes all related day schedules)
     */
    public function destroy($id)
    {
        Log::info('EmployeeScheduleController@destroy - Deleting employee schedule', [
            'user_id' => auth()->id(),
            'schedule_id' => $id
        ]);

        try {
            // Find the representative schedule record
            $schedule = EmployeeSchedule::findOrFail($id);
            
            DB::beginTransaction();

            // Delete all schedules for this employee and effective date
            $deletedCount = EmployeeSchedule::where('employee_id', $schedule->employee_id)
                ->where('effective_date', $schedule->effective_date)
                ->delete();

            DB::commit();

            Log::info('EmployeeScheduleController@destroy - Successfully deleted employee schedule', [
                'user_id' => auth()->id(),
                'schedule_id' => $id,
                'employee_id' => $schedule->employee_id,
                'schedules_deleted' => $deletedCount
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Employee schedule deleted successfully',
                'schedules_deleted' => $deletedCount
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            
            Log::error('EmployeeScheduleController@destroy - Error deleting employee schedule', [
                'user_id' => auth()->id(),
                'schedule_id' => $id,
                'error_message' => $e->getMessage(),
                'error_file' => $e->getFile(),
                'error_line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to delete employee schedule: ' . $e->getMessage()
            ], 500);
        }
    }

    public function getEmployeeScheduleForDate(Request $request, $employeeId)
    {
        try {
            $date = $request->input('date', now()->toDateString());
            $schedule = EmployeeSchedule::getEmployeeScheduleForDate($employeeId, $date);

            return response()->json([
                'success' => true,
                'schedule' => $schedule,
                'date' => $date
            ]);

        } catch (\Exception $e) {
            Log::error('Error getting employee schedule for date', [
                'employee_id' => $employeeId,
                'date' => $request->input('date'),
                'error' => $e->getMessage()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to get employee schedule for date'
            ], 500);
        }
    }

    


    public function list(Request $request)
    {
        Log::info('EmployeeScheduleController@list - Starting schedule list request', [
            'user_id' => auth()->id(),
            'filters' => [
                'search' => $request->input('search'),
                'department' => $request->input('department'),
                'status' => $request->input('status'),
                'shift_type' => $request->input('shift_type'),
                'work_day' => $request->input('work_day')
            ],
            'request_ip' => $request->ip()
        ]);

        try {
            // Check if tables exist
            $schedulesTableExists = DB::getSchemaBuilder()->hasTable('employee_schedules');
            $employeesTableExists = DB::getSchemaBuilder()->hasTable('employees');

            Log::info('Table existence check', [
                'employee_schedules_exists' => $schedulesTableExists,
                'employees_exists' => $employeesTableExists
            ]);

            if (!$schedulesTableExists) {
                Log::error('employee_schedules table does not exist');
                return response()->json([
                    'success' => false,
                    'error' => 'Database table not found',
                    'message' => 'The employee_schedules table does not exist.',
                    'schedules' => [],
                    'total' => 0
                ], 500);
            }

            if (!$employeesTableExists) {
                Log::error('employees table does not exist');
                return response()->json([
                    'success' => false,
                    'error' => 'Database table not found',
                    'message' => 'The employees table does not exist.',
                    'schedules' => [],
                    'total' => 0
                ], 500);
            }

            // Check for data in schedules table
            $totalSchedules = EmployeeSchedule::count();
            Log::info('Total schedules in database', ['count' => $totalSchedules]);

            if ($totalSchedules === 0) {
                Log::info('No schedules found in database');
                return response()->json([
                    'success' => true,
                    'schedules' => [],
                    'total' => 0,
                    'message' => 'No schedules found in database'
                ]);
            }

            $query = EmployeeSchedule::with(['employee:id,idno,Fname,Lname,Department']);

            // Apply search filter with improved case-insensitive matching
            if ($request->filled('search')) {
                $search = trim($request->search);
                Log::debug('EmployeeScheduleController@list - Applying search filter', [
                    'search_term' => $search
                ]);
                
                $query->whereHas('employee', function($q) use ($search) {
                    $q->where(function($subQuery) use ($search) {
                        $subQuery->whereRaw('LOWER(Fname) LIKE ?', ['%' . strtolower($search) . '%'])
                                ->orWhereRaw('LOWER(Lname) LIKE ?', ['%' . strtolower($search) . '%'])
                                ->orWhereRaw('LOWER(idno) LIKE ?', ['%' . strtolower($search) . '%'])
                                ->orWhereRaw('LOWER(Department) LIKE ?', ['%' . strtolower($search) . '%'])
                                ->orWhereRaw('LOWER(CONCAT(Fname, " ", Lname)) LIKE ?', ['%' . strtolower($search) . '%'])
                                ->orWhereRaw('LOWER(CONCAT(Lname, ", ", Fname)) LIKE ?', ['%' . strtolower($search) . '%']);
                    });
                });
                
                // Also search in schedule-specific fields
                $query->orWhere(function($scheduleQuery) use ($search) {
                    $scheduleQuery->whereRaw('LOWER(shift_type) LIKE ?', ['%' . strtolower($search) . '%'])
                                 ->orWhereRaw('LOWER(work_day) LIKE ?', ['%' . strtolower($search) . '%'])
                                 ->orWhereRaw('LOWER(status) LIKE ?', ['%' . strtolower($search) . '%'])
                                 ->orWhereRaw('LOWER(notes) LIKE ?', ['%' . strtolower($search) . '%']);
                });
            }

            // Apply department filter
            if ($request->filled('department')) {
                Log::debug('EmployeeScheduleController@list - Applying department filter', [
                    'department' => $request->department
                ]);
                
                $query->whereHas('employee', function($q) use ($request) {
                    $q->where('Department', $request->department);
                });
            }

            // Apply status filter
            if ($request->filled('status')) {
                Log::debug('EmployeeScheduleController@list - Applying status filter', [
                    'status' => $request->status
                ]);
                
                $query->where('status', $request->status);
            }

            // Apply shift type filter
            if ($request->filled('shift_type')) {
                Log::debug('EmployeeScheduleController@list - Applying shift type filter', [
                    'shift_type' => $request->shift_type
                ]);
                
                $query->where('shift_type', $request->shift_type);
            }

            // Apply work day filter
            if ($request->filled('work_day')) {
                Log::debug('EmployeeScheduleController@list - Applying work day filter', [
                    'work_day' => $request->work_day
                ]);
                
                $query->where('work_day', $request->work_day);
            }

            // Apply date range filters
            if ($request->filled('date_from')) {
                Log::debug('EmployeeScheduleController@list - Applying date from filter', [
                    'date_from' => $request->date_from
                ]);
                
                $query->where('effective_date', '>=', $request->date_from);
            }

            if ($request->filled('date_to')) {
                Log::debug('EmployeeScheduleController@list - Applying date to filter', [
                    'date_to' => $request->date_to
                ]);
                
                $query->where(function($q) use ($request) {
                    $q->whereNull('end_date')
                      ->orWhere('end_date', '<=', $request->date_to);
                });
            }

            // Apply current active schedules filter
            if ($request->boolean('current_only')) {
                Log::debug('EmployeeScheduleController@list - Applying current schedules filter');
                
                $today = now()->format('Y-m-d');
                $query->where('effective_date', '<=', $today)
                      ->where(function($q) use ($today) {
                          $q->whereNull('end_date')
                            ->orWhere('end_date', '>=', $today);
                      })
                      ->where('status', 'active');
            }

            // Get the SQL query for debugging
            $sql = $query->toSql();
            $bindings = $query->getBindings();
            Log::debug('SQL Query', ['sql' => $sql, 'bindings' => $bindings]);

            // Order by employee name and work day
            $schedules = $query->orderBy('employee_id')
                              ->orderByRaw("FIELD(work_day, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')")
                              ->orderBy('effective_date', 'desc')
                              ->get();

            Log::debug('EmployeeScheduleController@list - Schedules retrieved from database', [
                'total_schedules' => $schedules->count(),
                'first_schedule' => $schedules->first() ? $schedules->first()->toArray() : null
            ]);

            // Group schedules by employee for better display
            $groupedSchedules = $schedules->groupBy('employee_id')->map(function ($employeeSchedules) {
                $employee = $employeeSchedules->first()->employee;
                $workDays = $employeeSchedules->pluck('work_day')->toArray();
                $workDaysFormatted = $employeeSchedules->pluck('work_day_abbrev')->join(', ');
                
                // Get the representative schedule (first one for display purposes)
                $representativeSchedule = $employeeSchedules->first();
                
                return [
                    'id' => $representativeSchedule->id,
                    'employee_id' => $employee->id,
                    'employee' => $employee,
                    'shift_type' => $representativeSchedule->shift_type,
                    'start_time' => $representativeSchedule->start_time,
                    'end_time' => $representativeSchedule->end_time,
                    'break_start' => $representativeSchedule->break_start,
                    'break_end' => $representativeSchedule->break_end,
                    'work_days' => $workDays,
                    'work_days_formatted' => $workDaysFormatted,
                    'effective_date' => $representativeSchedule->effective_date,
                    'end_date' => $representativeSchedule->end_date,
                    'status' => $representativeSchedule->status,
                    'notes' => $representativeSchedule->notes,
                    'schedules_count' => $employeeSchedules->count(),
                    'individual_schedules' => $employeeSchedules->toArray()
                ];
            })->values();

            Log::info('EmployeeScheduleController@list - Successfully retrieved employee schedules', [
                'user_id' => auth()->id(),
                'total_schedules' => $schedules->count(),
                'grouped_schedules' => $groupedSchedules->count(),
                'filters_applied' => array_filter([
                    'search' => $request->input('search'),
                    'department' => $request->input('department'),
                    'status' => $request->input('status'),
                    'shift_type' => $request->input('shift_type'),
                    'work_day' => $request->input('work_day')
                ]),
                'execution_time' => microtime(true) - LARAVEL_START
            ]);

            return response()->json([
                'success' => true,
                'schedules' => $groupedSchedules,
                'total' => $groupedSchedules->count(),
                'raw_schedules_count' => $schedules->count(),
                'debug' => [
                    'total_in_db' => $totalSchedules,
                    'after_filters' => $schedules->count(),
                    'grouped_count' => $groupedSchedules->count(),
                    'sql' => $sql,
                    'bindings' => $bindings
                ]
            ]);

        } catch (\Exception $e) {
            Log::error('EmployeeScheduleController@list - Error fetching employee schedules', [
                'user_id' => auth()->id(),
                'error_message' => $e->getMessage(),
                'error_file' => $e->getFile(),
                'error_line' => $e->getLine(),
                'filters' => [
                    'search' => $request->input('search'),
                    'department' => $request->input('department'),
                    'status' => $request->input('status'),
                    'shift_type' => $request->input('shift_type'),
                    'work_day' => $request->input('work_day')
                ],
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'success' => false,
                'error' => 'Failed to fetch schedules',
                'message' => 'An error occurred while fetching the schedule data: ' . $e->getMessage(),
                'schedules' => [],
                'total' => 0
            ], 500);
        }
    }

    public function debug(Request $request)
    {
        try {
            $debug = [];
            
            // Check table existence
            $debug['tables_exist'] = [
                'employee_schedules' => DB::getSchemaBuilder()->hasTable('employee_schedules'),
                'employees' => DB::getSchemaBuilder()->hasTable('employees'),
            ];

            // Check table columns
            if ($debug['tables_exist']['employee_schedules']) {
                $debug['schedule_columns'] = DB::getSchemaBuilder()->getColumnListing('employee_schedules');
                $debug['schedule_count'] = EmployeeSchedule::count();
                
                // Get sample data
                $debug['sample_schedules'] = EmployeeSchedule::with('employee')
                    ->limit(5)
                    ->get()
                    ->toArray();
                    
                // Get work day distribution
                $debug['work_day_distribution'] = EmployeeSchedule::select('work_day', DB::raw('count(*) as count'))
                    ->groupBy('work_day')
                    ->orderByRaw("FIELD(work_day, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')")
                    ->pluck('count', 'work_day')
                    ->toArray();
            }

            if ($debug['tables_exist']['employees']) {
                $debug['employee_columns'] = DB::getSchemaBuilder()->getColumnListing('employees');
                $debug['employee_count'] = Employee::count();
                $debug['active_employee_count'] = Employee::where('JobStatus', 'Active')->count();
                
                // Get sample employees
                $debug['sample_employees'] = Employee::select('id', 'idno', 'Fname', 'Lname', 'Department', 'JobStatus')
                    ->limit(5)
                    ->get()
                    ->toArray();
            }

            // Database connection info
            $debug['database'] = [
                'default_connection' => config('database.default'),
                'connection_name' => DB::connection()->getName(),
            ];

            // User info
            $debug['user'] = [
                'id' => auth()->id(),
                'authenticated' => auth()->check(),
            ];

            return response()->json([
                'success' => true,
                'debug' => $debug,
                'timestamp' => now()
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ], 500);
        }
    }

    /**
     * Get employees formatted for select dropdown
     */
    public function getEmployeesForSelect(Request $request)
    {
        Log::info('EmployeeScheduleController@getEmployeesForSelect - Starting employees retrieval', [
            'user_id' => auth()->id(),
            'search' => $request->input('search'),
            'department' => $request->input('department'),
            'limit' => $request->input('limit', 100),
            'request_ip' => $request->ip()
        ]);

        try {
            $query = Employee::select('id', 'idno', 'Fname', 'Lname', 'Department')
                ->where('JobStatus', 'Active')
                ->orderBy('Fname')
                ->orderBy('Lname');

            // Apply improved search filter if provided
            if ($request->filled('search')) {
                $search = trim($request->search);
                Log::debug('EmployeeScheduleController@getEmployeesForSelect - Applying search filter', [
                    'search_term' => $search
                ]);

                $query->where(function($q) use ($search) {
                    $q->whereRaw('LOWER(Fname) LIKE ?', ['%' . strtolower($search) . '%'])
                      ->orWhereRaw('LOWER(Lname) LIKE ?', ['%' . strtolower($search) . '%'])
                      ->orWhereRaw('LOWER(idno) LIKE ?', ['%' . strtolower($search) . '%'])
                      ->orWhereRaw('LOWER(Department) LIKE ?', ['%' . strtolower($search) . '%'])
                      ->orWhereRaw('LOWER(CONCAT(Fname, " ", Lname)) LIKE ?', ['%' . strtolower($search) . '%'])
                      ->orWhereRaw('LOWER(CONCAT(Lname, ", ", Fname)) LIKE ?', ['%' . strtolower($search) . '%']);
                });
            }

            // Apply department filter if provided
            if ($request->filled('department')) {
                Log::debug('EmployeeScheduleController@getEmployeesForSelect - Applying department filter', [
                    'department' => $request->department
                ]);

                $query->where('Department', $request->department);
            }

            // Limit results for performance (optional)
            $limit = $request->input('limit', 100);
            if ($limit > 0) {
                $query->limit($limit);
            }

            $employees = $query->get();

            Log::info('EmployeeScheduleController@getEmployeesForSelect - Successfully retrieved employees', [
                'user_id' => auth()->id(),
                'employees_count' => $employees->count(),
                'filters_applied' => array_filter([
                    'search' => $request->input('search'),
                    'department' => $request->input('department')
                ]),
                'execution_time' => microtime(true) - LARAVEL_START
            ]);

            return response()->json($employees);

        } catch (\Exception $e) {
            Log::error('EmployeeScheduleController@getEmployeesForSelect - Error fetching employees', [
                'user_id' => auth()->id(),
                'error_message' => $e->getMessage(),
                'error_file' => $e->getFile(),
                'error_line' => $e->getLine(),
                'search' => $request->input('search'),
                'department' => $request->input('department'),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([
                'error' => 'Failed to fetch employees',
                'employees' => [],
                'total' => 0
            ], 500);
        }
    }

    public function getDepartments()
    {
        Log::info('EmployeeScheduleController@getDepartments - Starting departments retrieval', [
            'user_id' => auth()->id(),
            'request_ip' => request()->ip()
        ]);

        try {
            $departments = Employee::select('Department')
                ->whereNotNull('Department')
                ->where('Department', '!=', '')
                ->distinct()
                ->orderBy('Department')
                ->pluck('Department');

            Log::info('EmployeeScheduleController@getDepartments - Successfully retrieved departments', [
                'user_id' => auth()->id(),
                'departments_count' => $departments->count(),
                'departments' => $departments->toArray(),
                'execution_time' => microtime(true) - LARAVEL_START
            ]);

            return response()->json($departments);

        } catch (\Exception $e) {
            Log::error('EmployeeScheduleController@getDepartments - Error fetching departments', [
                'user_id' => auth()->id(),
                'error_message' => $e->getMessage(),
                'error_file' => $e->getFile(),
                'error_line' => $e->getLine(),
                'trace' => $e->getTraceAsString()
            ]);

            return response()->json([], 500);
        }
    }

    public function getStatistics(Request $request)
    {
        try {
            $filters = $request->only(['department', 'shift_type', 'status']);
            $stats = EmployeeSchedule::getStatistics($filters);

            return response()->json([
                'success' => true,
                'statistics' => $stats
            ]);

        } catch (\Exception $e) {
            Log::error('Error getting schedule statistics', [
                'error' => $e->getMessage(),
                'filters' => $request->only(['department', 'shift_type', 'status'])
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to get statistics'
            ], 500);
        }
    }

    public function importImproved(Request $request)
    {
        Log::info('EmployeeScheduleController@importImproved - Starting enhanced schedule import', [
            'user_id' => auth()->id(),
            'request_ip' => $request->ip()
        ]);

        try {
            Log::info('EmployeeScheduleController@import - Request data received', [
                'user_id' => auth()->id(),
                'request_data' => $request->all(),
                'has_file' => $request->hasFile('file'),
                'files' => $request->allFiles()
            ]);

            // Enhanced validation with better rules
            $validator = Validator::make($request->all(), [
                'file' => 'required|file|mimes:xlsx,xls,csv|max:10240',
                'effective_date' => 'nullable|date|after_or_equal:today',
                'overwrite_existing' => 'nullable|boolean'
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Validation failed',
                    'errors' => $validator->errors()
                ], 422);
            }

            $file = $request->file('file');
            $effectiveDate = $request->input('effective_date') ?? now()->addDay()->format('Y-m-d');
            $overwriteExisting = $request->boolean('overwrite_existing', false);

            // Load spreadsheet with error handling
            try {
                $spreadsheet = IOFactory::load($file->getPathname());
                $worksheet = $spreadsheet->getActiveSheet();
                $rows = $worksheet->toArray();
            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to read file: ' . $e->getMessage()
                ], 400);
            }

            if (empty($rows) || count($rows) < 2) {
                return response()->json([
                    'success' => false,
                    'message' => 'File appears to be empty or contains no data rows'
                ], 400);
            }

            // Skip header row and validate structure
            $header = array_shift($rows);

            $imported = 0;
            $skipped = 0;
            $errors = [];
            $validWorkDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

            DB::beginTransaction();

            foreach ($rows as $index => $row) {
                $rowNumber = $index + 2;
                
                try {
                    // Skip empty rows
                    if (empty(array_filter($row, function($value) { return !is_null($value) && $value !== ''; }))) {
                        $skipped++;
                        continue;
                    }

                    // Validate required fields
                    if (empty($row[0]) || empty($row[1]) || empty($row[2]) || empty($row[3]) || empty($row[4])) {
                        $errors[] = "Row {$rowNumber}: Missing required fields (Employee ID, Shift Type, Work Days, Start Time, End Time)";
                        continue;
                    }

                    // Find employee
                    $employee = Employee::where('idno', trim($row[0]))->first();
                    if (!$employee) {
                        $errors[] = "Row {$rowNumber}: Employee ID '{$row[0]}' not found";
                        continue;
                    }

                    // Validate shift type
                    $shiftType = strtolower(trim($row[1]));
                    $validShiftTypes = ['regular', 'night', 'flexible', 'rotating'];
                    if (!in_array($shiftType, $validShiftTypes)) {
                        $errors[] = "Row {$rowNumber}: Invalid shift type '{$row[1]}'. Must be one of: " . implode(', ', $validShiftTypes);
                        continue;
                    }

                    // Parse and validate work days
                    $workDaysString = trim($row[2]);
                    if (empty($workDaysString)) {
                        $errors[] = "Row {$rowNumber}: Work days cannot be empty";
                        continue;
                    }

                    $workDays = array_map('trim', explode(',', $workDaysString));
                    $workDays = array_map('strtolower', $workDays);
                    $invalidDays = array_diff($workDays, $validWorkDays);
                    
                    if (!empty($invalidDays)) {
                        $errors[] = "Row {$rowNumber}: Invalid work days: " . implode(', ', $invalidDays);
                        continue;
                    }

                    // Validate time formats
                    $startTime = $this->validateTimeFormat($row[3], "Row {$rowNumber}: Invalid start time format");
                    $endTime = $this->validateTimeFormat($row[4], "Row {$rowNumber}: Invalid end time format");
                    
                    if (!$startTime || !$endTime) {
                        $errors[] = "Row {$rowNumber}: Invalid time format. Use HH:MM format (e.g., 09:00, 17:30)";
                        continue;
                    }

                    // Validate break times if provided
                    $breakStart = null;
                    $breakEnd = null;
                    if (!empty($row[5]) && !empty($row[6])) {
                        $breakStart = $this->validateTimeFormat($row[5], "Row {$rowNumber}: Invalid break start time");
                        $breakEnd = $this->validateTimeFormat($row[6], "Row {$rowNumber}: Invalid break end time");
                        
                        if (!$breakStart || !$breakEnd) {
                            $errors[] = "Row {$rowNumber}: Invalid break time format";
                            continue;
                        }
                    }

                    // Handle overwrite logic
                    if ($overwriteExisting) {
                        EmployeeSchedule::where('employee_id', $employee->id)
                            ->where('effective_date', $effectiveDate)
                            ->delete();
                    }

                    // Create schedule records for each work day
                    foreach ($workDays as $workDay) {
                        // Check for duplicates if not overwriting
                        if (!$overwriteExisting) {
                            $existing = EmployeeSchedule::where([
                                'employee_id' => $employee->id,
                                'work_day' => $workDay,
                                'effective_date' => $effectiveDate
                            ])->exists();

                            if ($existing) {
                                $errors[] = "Row {$rowNumber}: Schedule for {$employee->Fname} {$employee->Lname} on {$workDay} already exists for {$effectiveDate}";
                                continue 2;
                            }
                        }

                        EmployeeSchedule::create([
                            'employee_id' => $employee->id,
                            'shift_type' => $shiftType,
                            'work_day' => $workDay,
                            'start_time' => $startTime,
                            'end_time' => $endTime,
                            'break_start' => $breakStart,
                            'break_end' => $breakEnd,
                            'effective_date' => $effectiveDate,
                            'end_date' => !empty($row[8]) ? Carbon::parse($row[8])->format('Y-m-d') : null,
                            'status' => !empty($row[9]) ? strtolower(trim($row[9])) : 'active',
                            'notes' => !empty($row[10]) ? trim($row[10]) : null,
                            'created_by' => auth()->id()
                        ]);

                        $imported++;
                    }

                } catch (\Exception $e) {
                    $errors[] = "Row {$rowNumber}: " . $e->getMessage();
                    Log::error('Import row error', [
                        'row' => $rowNumber,
                        'data' => $row,
                        'error' => $e->getMessage()
                    ]);
                }
            }

            DB::commit();

            Log::info('EmployeeScheduleController@importImproved - Import completed', [
                'user_id' => auth()->id(),
                'imported_count' => $imported,
                'skipped_count' => $skipped,
                'errors_count' => count($errors),
                'effective_date' => $effectiveDate
            ]);

            $message = "Import completed successfully.";
            if ($imported > 0) $message .= " {$imported} schedules imported.";
            if ($skipped > 0) $message .= " {$skipped} empty rows skipped.";
            if (count($errors) > 0) $message .= " " . count($errors) . " errors occurred.";

            return response()->json([
                'success' => true,
                'message' => $message,
                'imported' => $imported,
                'skipped' => $skipped,
                'errors' => $errors,
                'effective_date' => $effectiveDate
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            
            Log::error('EmployeeScheduleController@importImproved - Critical import error', [
                'user_id' => auth()->id(),
                'error_message' => $e->getMessage(),
                'error_file' => $e->getFile(),
                'error_line' => $e->getLine()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Import failed: ' . $e->getMessage()
            ], 500);
        }
    }

    private function validateTimeFormat($time, $errorContext = null)
    {
        if (empty($time)) return null;
        
        $time = trim($time);
        
        // Try to parse various time formats
        try {
            // Handle common formats: HH:MM, H:MM, HH:MM:SS
            if (preg_match('/^\d{1,2}:\d{2}(:\d{2})?$/', $time)) {
                $carbon = Carbon::createFromFormat('H:i', substr($time, 0, 5));
                return $carbon->format('H:i');
            }
            
            // Try parsing with Carbon for more flexibility
            $carbon = Carbon::parse($time);
            return $carbon->format('H:i');
            
        } catch (\Exception $e) {
            return false;
        }
    }

}