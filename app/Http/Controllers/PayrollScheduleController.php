<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;
use Inertia\Inertia;

use App\Models\Employee;
use App\Models\PayrollSummary;
use App\Models\EmployeeSchedule;
use App\Models\CancelRestDay;
use App\Models\ChangeOffSchedule;
use App\Models\Offset;
use App\Models\Retro;
use App\Models\SLVL;
use App\Models\TimeSchedule;
use App\Models\TravelOrder;
use App\Models\Overtime;
use App\Models\ProcessedAttendance;

class PayrollScheduleController extends Controller
{
    /**
     * Display the payroll schedule integration page.
     */
    public function index(Request $request)
    {
        try {
            $year = $request->input('year', now()->year);
            $month = $request->input('month', now()->month);
            $periodType = $request->input('period_type', '1st_half');
            $department = $request->input('department');
            $employee_id = $request->input('employee_id');
            $search = $request->input('search');

            // Calculate period dates
            [$startDate, $endDate] = PayrollSummary::calculatePeriodDates($year, $month, $periodType);

            Log::info('PayrollScheduleController@index - Period dates calculated', [
                'year' => $year,
                'month' => $month,
                'period_type' => $periodType,
                'start_date' => $startDate->format('Y-m-d'),
                'end_date' => $endDate->format('Y-m-d')
            ]);

            // Get employees with schedules and payroll data
            $query = Employee::query()
                ->with([
                    'employeeSchedules' => function($q) use ($startDate, $endDate) {
                        $q->where(function($subQ) use ($startDate, $endDate) {
                            // Include schedules that overlap with the period at all
                            $subQ->where(function($overlap) use ($startDate, $endDate) {
                                // Schedule starts before period ends AND schedule ends after period starts
                                $overlap->where('effective_date', '<=', $endDate)
                                       ->where(function($end) use ($startDate) {
                                           $end->whereNull('end_date')
                                              ->orWhere('end_date', '>=', $startDate);
                                       });
                            });
                        })
                        ->active()
                        ->orderBy('work_day');
                    }
                ])
                ->select([
                    'id', 'idno', 'Fname', 'Lname', 'Department', 
                    'Line', 'CostCenter', 'Jobtitle', 'JobStatus'
                ])
                ->where('JobStatus', 'Active');

            if ($department) {
                $query->where('Department', $department);
            }

            if ($employee_id) {
                $query->where('id', $employee_id);
            }

            // Add search functionality
            if ($search) {
                $searchTerm = '%' . $search . '%';
                $query->where(function($q) use ($searchTerm) {
                    $q->where('idno', 'like', $searchTerm)
                      ->orWhere('Fname', 'like', $searchTerm)
                      ->orWhere('Lname', 'like', $searchTerm)
                      ->orWhere('Department', 'like', $searchTerm)
                      ->orWhere('Line', 'like', $searchTerm)
                      ->orWhere('Jobtitle', 'like', $searchTerm)
                      ->orWhereRaw("CONCAT(Fname, ' ', Lname) LIKE ?", [$searchTerm])
                      ->orWhereRaw("CONCAT(Lname, ', ', Fname) LIKE ?", [$searchTerm]);
                });
            }

            $employees = $query->get();

            // Explicitly add schedule count and ensure relationships are loaded
            $employees->each(function($employee) {
                $employee->schedule_count = $employee->employeeSchedules->count();
                $employee->has_schedules = $employee->employeeSchedules->count() > 0;
                // Make sure the relationship is accessible
                $employee->makeVisible(['employeeSchedules']);
            });

            Log::info('PayrollScheduleController@index - Employees retrieved', [
                'total_employees' => $employees->count(),
                'employees_with_schedules' => $employees->filter(function($emp) { return $emp->employeeSchedules->count() > 0; })->count(),
                'sample_employee_schedules' => $employees->take(3)->map(function($emp) {
                    return [
                        'employee_id' => $emp->id,
                        'employee_name' => $emp->Fname . ' ' . $emp->Lname,
                        'schedules_count' => $emp->employeeSchedules->count(),
                        'schedules' => $emp->employeeSchedules->map(function($sched) {
                            return [
                                'effective_date' => $sched->effective_date,
                                'end_date' => $sched->end_date,
                                'work_day' => $sched->work_day,
                                'status' => $sched->status
                            ];
                        })->toArray()
                    ];
                })->toArray()
            ]);

            // Get payroll summaries for the period
            $payrollSummaries = PayrollSummary::forPeriod($year, $month, $periodType)
                ->with('employee:id,idno,Fname,Lname,Department')
                ->when($department, function($q) use ($department) {
                    $q->where('department', $department);
                })
                ->when($employee_id, function($q) use ($employee_id) {
                    $q->where('employee_id', $employee_id);
                })
                ->get()
                ->keyBy('employee_id');

            // Get sync statistics for the period
            $syncStats = $this->getSyncStatistics($year, $month, $periodType, $department, $employee_id, $search);

            // Get departments for filter
            $departments = Employee::where('JobStatus', 'Active')
                ->distinct()
                ->pluck('Department')
                ->filter()
                ->sort()
                ->values();

            // Get available years and months for filters
            $availableYears = collect(range(now()->year - 2, now()->year + 1));
            $availableMonths = collect(range(1, 12))->map(function($month) {
                return [
                    'value' => $month,
                    'label' => Carbon::create(null, $month)->format('F')
                ];
            });

            return Inertia::render('PayrollScheduleIntegration/Index', [
                'employees' => $employees->toArray(),
                'payrollSummaries' => $payrollSummaries,
                'syncStats' => $syncStats,
                'departments' => $departments,
                'filters' => [
                    'year' => $year,
                    'month' => $month,
                    'period_type' => $periodType,
                    'department' => $department,
                    'employee_id' => $employee_id,
                    'search' => $search,
                ],
                'periodInfo' => [
                    'start_date' => $startDate->format('Y-m-d'),
                    'end_date' => $endDate->format('Y-m-d'),
                    'label' => $periodType === '1st_half' ? '1-15' : '16-' . $endDate->day,
                    'month_name' => $startDate->format('F Y'),
                ],
                'auth' => [
                    'user' => auth()->user()
                ],
                'availableYears' => $availableYears,
                'availableMonths' => $availableMonths,
            ]);

        } catch (\Exception $e) {
            Log::error('Error in PayrollScheduleController@index', [
                'error' => $e->getMessage(),
                'filters' => $request->all()
            ]);

            return back()->withErrors(['error' => 'Failed to load payroll schedule integration data.']);
        }
    }

    /**
     * Sync payroll data with schedule and attendance data for specific employees.
     */
    public function syncPayrollData(Request $request)
    {
        $request->validate([
            'year' => 'required|integer|min:2020|max:2030',
            'month' => 'required|integer|min:1|max:12',
            'period_type' => 'required|in:1st_half,2nd_half',
            'employee_ids' => 'required|array',
            'employee_ids.*' => 'integer|exists:employees,id',
            'sync_options' => 'required|array',
            'sync_options.create_missing' => 'boolean',
            'sync_options.update_existing' => 'boolean',
            'sync_options.include_schedules' => 'boolean',
            'sync_options.include_attendance' => 'boolean',
        ]);

        try {
            DB::beginTransaction();

            $year = $request->input('year');
            $month = $request->input('month');
            $periodType = $request->input('period_type');
            $employeeIds = $request->input('employee_ids');
            $syncOptions = $request->input('sync_options');

            $results = [
                'created' => 0,
                'updated' => 0,
                'errors' => [],
                'employee_results' => []
            ];

            foreach ($employeeIds as $employeeId) {
                try {
                    $result = $this->syncEmployeePayrollData(
                        $employeeId, 
                        $year, 
                        $month, 
                        $periodType, 
                        $syncOptions
                    );

                    $results['employee_results'][$employeeId] = $result;
                    
                    if ($result['action'] === 'created') {
                        $results['created']++;
                    } elseif ($result['action'] === 'updated') {
                        $results['updated']++;
                    }

                } catch (\Exception $e) {
                    Log::error('Error syncing employee payroll data', [
                        'employee_id' => $employeeId,
                        'error' => $e->getMessage()
                    ]);

                    $results['errors'][] = "Employee ID {$employeeId}: " . $e->getMessage();
                }
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => "Sync completed. Created: {$results['created']}, Updated: {$results['updated']}",
                'results' => $results
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Error in PayrollScheduleController@syncPayrollData', [
                'error' => $e->getMessage(),
                'request' => $request->all()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to sync payroll data: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get detailed sync information for a specific employee.
     */
    public function getEmployeeSyncDetails(Request $request, $employeeId)
    {
        $request->validate([
            'year' => 'required|integer',
            'month' => 'required|integer|min:1|max:12',
            'period_type' => 'required|in:1st_half,2nd_half',
        ]);

        try {
            $year = $request->input('year');
            $month = $request->input('month');
            $periodType = $request->input('period_type');

            [$startDate, $endDate] = PayrollSummary::calculatePeriodDates($year, $month, $periodType);

            $employee = Employee::with([
                'employeeSchedules' => function($q) use ($startDate, $endDate) {
                    $q->effectiveBetween($startDate, $endDate)
                      ->orderBy('work_day');
                }
            ])->findOrFail($employeeId);

            // Get existing payroll summary
            $payrollSummary = PayrollSummary::forPeriod($year, $month, $periodType)
                ->where('employee_id', $employeeId)
                ->first();

            // Get related data for the period
            $relatedData = $this->getEmployeeRelatedData($employeeId, $startDate, $endDate);

            // Get attendance summary
            $attendanceSummary = $this->getAttendanceSummary($employeeId, $startDate, $endDate);

            return response()->json([
                'success' => true,
                'data' => [
                    'employee' => $employee,
                    'payroll_summary' => $payrollSummary,
                    'related_data' => $relatedData,
                    'attendance_summary' => $attendanceSummary,
                    'period' => [
                        'start_date' => $startDate->format('Y-m-d'),
                        'end_date' => $endDate->format('Y-m-d'),
                        'label' => $periodType === '1st_half' ? '1-15' : '16-' . $endDate->day,
                    ]
                ]
            ]);

        } catch (\Exception $e) {
            Log::error('Error in PayrollScheduleController@getEmployeeSyncDetails', [
                'employee_id' => $employeeId,
                'error' => $e->getMessage()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to get employee sync details: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Generate payroll summary for employees without existing records.
     */
    public function generatePayrollSummaries(Request $request)
    {
        $request->validate([
            'year' => 'required|integer|min:2020|max:2030',
            'month' => 'required|integer|min:1|max:12',
            'period_type' => 'required|in:1st_half,2nd_half',
            'department' => 'nullable|string',
            'force_regenerate' => 'boolean'
        ]);

        try {
            DB::beginTransaction();

            $year = $request->input('year');
            $month = $request->input('month');
            $periodType = $request->input('period_type');
            $department = $request->input('department');
            $forceRegenerate = $request->input('force_regenerate', false);

            // Get employees that need payroll summaries
            $employees = Employee::where('JobStatus', 'Active')
                ->when($department, function($q) use ($department) {
                    $q->where('Department', $department);
                })
                ->get();

            $results = [
                'created' => 0,
                'updated' => 0,
                'skipped' => 0,
                'errors' => []
            ];

            foreach ($employees as $employee) {
                try {
                    // Check if payroll summary already exists
                    $existingSummary = PayrollSummary::forPeriod($year, $month, $periodType)
                        ->where('employee_id', $employee->id)
                        ->first();

                    if ($existingSummary && !$forceRegenerate) {
                        $results['skipped']++;
                        continue;
                    }

                    if ($existingSummary && $forceRegenerate) {
                        // Update existing summary
                        $summaryData = PayrollSummary::generateFromAttendance(
                            $employee->id, 
                            $year, 
                            $month, 
                            $periodType
                        );
                        
                        $existingSummary->update($summaryData);
                        $results['updated']++;
                    } else {
                        // Create new summary
                        $summaryData = PayrollSummary::generateFromAttendance(
                            $employee->id, 
                            $year, 
                            $month, 
                            $periodType
                        );
                        
                        PayrollSummary::create($summaryData);
                        $results['created']++;
                    }

                } catch (\Exception $e) {
                    Log::error('Error generating payroll summary', [
                        'employee_id' => $employee->id,
                        'error' => $e->getMessage()
                    ]);

                    $results['errors'][] = "Employee {$employee->idno}: " . $e->getMessage();
                }
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => "Generation completed. Created: {$results['created']}, Updated: {$results['updated']}, Skipped: {$results['skipped']}",
                'results' => $results
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Error in PayrollScheduleController@generatePayrollSummaries', [
                'error' => $e->getMessage(),
                'request' => $request->all()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to generate payroll summaries: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Export payroll schedule integration data.
     */
    public function export(Request $request)
    {
        $request->validate([
            'year' => 'required|integer',
            'month' => 'required|integer|min:1|max:12',
            'period_type' => 'required|in:1st_half,2nd_half',
            'department' => 'nullable|string',
            'format' => 'required|in:xlsx,csv'
        ]);

        try {
            $year = $request->input('year');
            $month = $request->input('month');
            $periodType = $request->input('period_type');
            $department = $request->input('department');
            $format = $request->input('format');

            [$startDate, $endDate] = PayrollSummary::calculatePeriodDates($year, $month, $periodType);

            // Get comprehensive payroll data
            $data = $this->getExportData($year, $month, $periodType, $department);

            // Generate filename
            $filename = "payroll_schedule_integration_{$year}_{$month}_{$periodType}";
            if ($department) {
                $filename .= "_{$department}";
            }
            $filename .= ".{$format}";

            // Return download response
            return $this->generateExportFile($data, $filename, $format);

        } catch (\Exception $e) {
            Log::error('Error in PayrollScheduleController@export', [
                'error' => $e->getMessage(),
                'request' => $request->all()
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to export data: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Sync individual employee payroll data.
     */
    private function syncEmployeePayrollData($employeeId, $year, $month, $periodType, $syncOptions)
    {
        $employee = Employee::findOrFail($employeeId);
        
        // Check if payroll summary exists
        $existingSummary = PayrollSummary::forPeriod($year, $month, $periodType)
            ->where('employee_id', $employeeId)
            ->first();

        if ($existingSummary && !$syncOptions['update_existing']) {
            return [
                'action' => 'skipped',
                'reason' => 'Already exists and update_existing is false',
                'payroll_summary_id' => $existingSummary->id
            ];
        }

        if (!$existingSummary && !$syncOptions['create_missing']) {
            return [
                'action' => 'skipped',
                'reason' => 'Does not exist and create_missing is false',
                'payroll_summary_id' => null
            ];
        }

        // Generate summary data from attendance
        $summaryData = PayrollSummary::generateFromAttendance(
            $employeeId, 
            $year, 
            $month, 
            $periodType
        );

        // Add schedule-specific data if requested
        if ($syncOptions['include_schedules']) {
            $scheduleData = $this->getScheduleData($employeeId, $year, $month, $periodType);
            $summaryData = array_merge($summaryData, $scheduleData);
        }

        // Add attendance-specific enhancements if requested
        if ($syncOptions['include_attendance']) {
            $attendanceData = $this->getEnhancedAttendanceData($employeeId, $year, $month, $periodType);
            $summaryData = array_merge($summaryData, $attendanceData);
        }

        if ($existingSummary) {
            // Update existing summary
            $existingSummary->update($summaryData);
            return [
                'action' => 'updated',
                'payroll_summary_id' => $existingSummary->id,
                'data' => $summaryData
            ];
        } else {
            // Create new summary
            $newSummary = PayrollSummary::create($summaryData);
            return [
                'action' => 'created',
                'payroll_summary_id' => $newSummary->id,
                'data' => $summaryData
            ];
        }
    }

    /**
     * Get schedule-specific data for payroll integration.
     */
    private function getScheduleData($employeeId, $year, $month, $periodType)
    {
        [$startDate, $endDate] = PayrollSummary::calculatePeriodDates($year, $month, $periodType);

        $schedules = EmployeeSchedule::where('employee_id', $employeeId)
            ->effectiveBetween($startDate, $endDate)
            ->active()
            ->get();

        // Calculate expected work days based on schedules
        $expectedWorkDays = 0;
        $totalScheduledHours = 0;
        $nightShiftDays = 0;

        foreach ($schedules as $schedule) {
            // Count days in period that match this schedule
            $currentDate = $startDate->copy();
            while ($currentDate->lte($endDate)) {
                if ($schedule->appliesToDay($currentDate->dayOfWeek)) {
                    $expectedWorkDays++;
                    $totalScheduledHours += $schedule->getTotalWorkHours();
                    
                    if ($schedule->shift_type === 'night') {
                        $nightShiftDays++;
                    }
                }
                $currentDate->addDay();
            }
        }

        return [
            'expected_work_days' => $expectedWorkDays,
            'total_scheduled_hours' => $totalScheduledHours,
            'night_shift_days' => $nightShiftDays,
            'schedule_variance' => 0, // Will be calculated against actual attendance
        ];
    }

    /**
     * Get enhanced attendance data including related models.
     */
    private function getEnhancedAttendanceData($employeeId, $year, $month, $periodType)
    {
        [$startDate, $endDate] = PayrollSummary::calculatePeriodDates($year, $month, $periodType);

        $data = [];

        // Get cancel rest day data
        $cancelRestDays = CancelRestDay::where('employee_id', $employeeId)
            ->whereBetween('rest_day_date', [$startDate, $endDate])
            ->approved()
            ->count();
        $data['cancel_rest_days'] = $cancelRestDays;

        // Get change off schedule data
        $changeOffSchedules = ChangeOffSchedule::where('employee_id', $employeeId)
            ->whereBetween('original_date', [$startDate, $endDate])
            ->where('status', 'approved')
            ->count();
        $data['change_off_schedules'] = $changeOffSchedules;

        // Get offset data
        $offsetData = Offset::where('employee_id', $employeeId)
            ->whereBetween('date', [$startDate, $endDate])
            ->where('status', 'approved')
            ->selectRaw('SUM(hours) as total_offset_hours, COUNT(*) as offset_count')
            ->first();
        $data['total_offset_applications'] = $offsetData->offset_count ?? 0;
        $data['total_offset_hours_applied'] = $offsetData->total_offset_hours ?? 0;

        // Get retro data
        $retroData = Retro::where('employee_id', $employeeId)
            ->whereBetween('retro_date', [$startDate, $endDate])
            ->approved()
            ->selectRaw('SUM(computed_amount) as total_retro_amount, COUNT(*) as retro_count')
            ->first();
        $data['retro_applications'] = $retroData->retro_count ?? 0;
        $data['total_retro_amount'] = $retroData->total_retro_amount ?? 0;

        // Get SLVL data
        $slvlData = SLVL::where('employee_id', $employeeId)
            ->where(function($q) use ($startDate, $endDate) {
                $q->whereBetween('start_date', [$startDate, $endDate])
                  ->orWhereBetween('end_date', [$startDate, $endDate])
                  ->orWhere(function($subQ) use ($startDate, $endDate) {
                      $subQ->where('start_date', '<=', $startDate)
                           ->where('end_date', '>=', $endDate);
                  });
            })
            ->approved()
            ->selectRaw('SUM(total_days) as total_leave_days, COUNT(*) as leave_count')
            ->first();
        $data['leave_applications'] = $slvlData->leave_count ?? 0;
        $data['total_leave_days_period'] = $slvlData->total_leave_days ?? 0;

        // Get time schedule changes
        $timeScheduleChanges = TimeSchedule::where('employee_id', $employeeId)
            ->whereBetween('effective_date', [$startDate, $endDate])
            ->where('status', 'approved')
            ->count();
        $data['time_schedule_changes'] = $timeScheduleChanges;

        // Get travel order data
        $travelOrderData = TravelOrder::where('employee_id', $employeeId)
            ->where(function($q) use ($startDate, $endDate) {
                $q->whereBetween('start_date', [$startDate, $endDate])
                  ->orWhereBetween('end_date', [$startDate, $endDate]);
            })
            ->where('status', 'approved')
            ->selectRaw('SUM(working_days) as total_travel_days, COUNT(*) as travel_count')
            ->first();
        $data['travel_order_applications'] = $travelOrderData->travel_count ?? 0;
        $data['total_travel_working_days'] = $travelOrderData->total_travel_days ?? 0;

        // Get overtime data
        $overtimeData = Overtime::where('employee_id', $employeeId)
            ->whereBetween('date', [$startDate, $endDate])
            ->where('status', 'approved')
            ->selectRaw('
                SUM(total_hours) as total_ot_hours, 
                COUNT(*) as ot_count,
                SUM(CASE WHEN has_night_differential = 1 THEN total_hours ELSE 0 END) as night_diff_hours
            ')
            ->first();
        $data['overtime_applications'] = $overtimeData->ot_count ?? 0;
        $data['total_overtime_hours_applied'] = $overtimeData->total_ot_hours ?? 0;
        $data['night_differential_hours'] = $overtimeData->night_diff_hours ?? 0;

        return $data;
    }

    /**
     * Get related data for an employee for the sync details view.
     */
    private function getEmployeeRelatedData($employeeId, $startDate, $endDate)
    {
        return [
            'cancel_rest_days' => CancelRestDay::where('employee_id', $employeeId)
                ->whereBetween('rest_day_date', [$startDate, $endDate])
                ->with('approver:id,name')
                ->get(),
            
            'change_off_schedules' => ChangeOffSchedule::where('employee_id', $employeeId)
                ->whereBetween('original_date', [$startDate, $endDate])
                ->with('approver:id,name')
                ->get(),
            
            'offsets' => Offset::where('employee_id', $employeeId)
                ->whereBetween('date', [$startDate, $endDate])
                ->with(['offset_type', 'approver:id,name'])
                ->get(),
            
            'retros' => Retro::where('employee_id', $employeeId)
                ->whereBetween('retro_date', [$startDate, $endDate])
                ->with('approver:id,name')
                ->get(),
            
            'slvl' => SLVL::where('employee_id', $employeeId)
                ->where(function($q) use ($startDate, $endDate) {
                    $q->whereBetween('start_date', [$startDate, $endDate])
                      ->orWhereBetween('end_date', [$startDate, $endDate]);
                })
                ->with('approver:id,name')
                ->get(),
            
            'time_schedules' => TimeSchedule::where('employee_id', $employeeId)
                ->whereBetween('effective_date', [$startDate, $endDate])
                ->with(['scheduleType', 'approver:id,name'])
                ->get(),
            
            'travel_orders' => TravelOrder::where('employee_id', $employeeId)
                ->where(function($q) use ($startDate, $endDate) {
                    $q->whereBetween('start_date', [$startDate, $endDate])
                      ->orWhereBetween('end_date', [$startDate, $endDate]);
                })
                ->with('approver:id,name')
                ->get(),
            
            'overtime' => Overtime::where('employee_id', $employeeId)
                ->whereBetween('date', [$startDate, $endDate])
                ->with(['departmentApprover:id,name', 'hrdApprover:id,name'])
                ->get(),
        ];
    }

    /**
     * Get attendance summary for an employee.
     */
    private function getAttendanceSummary($employeeId, $startDate, $endDate)
    {
        $attendance = ProcessedAttendance::where('employee_id', $employeeId)
            ->whereBetween('attendance_date', [$startDate, $endDate])
            ->selectRaw('
                COUNT(*) as total_records,
                SUM(CASE WHEN time_in IS NOT NULL THEN 1 ELSE 0 END) as days_present,
                SUM(CASE WHEN time_in IS NULL THEN 1 ELSE 0 END) as days_absent,
                SUM(hours_worked) as total_hours_worked,
                SUM(overtime) as total_overtime,
                SUM(late_minutes) as total_late_minutes,
                SUM(undertime_minutes) as total_undertime_minutes,
                SUM(slvl) as total_leave_days,
                COUNT(CASE WHEN restday = 1 THEN 1 END) as rest_days_worked
            ')
            ->first();

        return $attendance ? $attendance->toArray() : [];
    }

    /**
     * Get sync statistics for the dashboard.
     */
    private function getSyncStatistics($year, $month, $periodType, $department = null, $employeeId = null, $search = null)
    {
        [$startDate, $endDate] = PayrollSummary::calculatePeriodDates($year, $month, $periodType);

        // Get employee count
        $employeeQuery = Employee::where('JobStatus', 'Active');
        if ($department) $employeeQuery->where('Department', $department);
        if ($employeeId) $employeeQuery->where('id', $employeeId);
        
        // Add search functionality
        if ($search) {
            $searchTerm = '%' . $search . '%';
            $employeeQuery->where(function($q) use ($searchTerm) {
                $q->where('idno', 'like', $searchTerm)
                  ->orWhere('Fname', 'like', $searchTerm)
                  ->orWhere('Lname', 'like', $searchTerm)
                  ->orWhere('Department', 'like', $searchTerm)
                  ->orWhere('Line', 'like', $searchTerm)
                  ->orWhere('Jobtitle', 'like', $searchTerm)
                  ->orWhereRaw("CONCAT(Fname, ' ', Lname) LIKE ?", [$searchTerm])
                  ->orWhereRaw("CONCAT(Lname, ', ', Fname) LIKE ?", [$searchTerm]);
            });
        }
        
        $totalEmployees = $employeeQuery->count();

        // Get payroll summaries count
        $payrollQuery = PayrollSummary::forPeriod($year, $month, $periodType);
        if ($department) $payrollQuery->where('department', $department);
        if ($employeeId) $payrollQuery->where('employee_id', $employeeId);
        $totalPayrollSummaries = $payrollQuery->count();

        // Get employees with schedules
        $scheduledEmployeesQuery = Employee::whereHas('employeeSchedules', function($q) use ($startDate, $endDate) {
            $q->effectiveBetween($startDate, $endDate)->active();
        });
        if ($department) $scheduledEmployeesQuery->where('Department', $department);
        if ($employeeId) $scheduledEmployeesQuery->where('id', $employeeId);
        
        // Add search functionality
        if ($search) {
            $searchTerm = '%' . $search . '%';
            $scheduledEmployeesQuery->where(function($q) use ($searchTerm) {
                $q->where('idno', 'like', $searchTerm)
                  ->orWhere('Fname', 'like', $searchTerm)
                  ->orWhere('Lname', 'like', $searchTerm)
                  ->orWhere('Department', 'like', $searchTerm)
                  ->orWhere('Line', 'like', $searchTerm)
                  ->orWhere('Jobtitle', 'like', $searchTerm)
                  ->orWhereRaw("CONCAT(Fname, ' ', Lname) LIKE ?", [$searchTerm])
                  ->orWhereRaw("CONCAT(Lname, ', ', Fname) LIKE ?", [$searchTerm]);
            });
        }
        
        $scheduledEmployees = $scheduledEmployeesQuery->count();

        // Get sync-related statistics
        $syncStats = [
            'employees' => [
                'total' => $totalEmployees,
                'with_schedules' => $scheduledEmployees,
                'with_payroll' => $totalPayrollSummaries,
                'missing_payroll' => $totalEmployees - $totalPayrollSummaries,
            ],
            'related_data' => [
                'cancel_rest_days' => CancelRestDay::whereBetween('rest_day_date', [$startDate, $endDate])
                    ->when($department, function($q) use ($department) {
                        $q->whereHas('employee', function($subQ) use ($department) {
                            $subQ->where('Department', $department);
                        });
                    })
                    ->when($employeeId, function($q) use ($employeeId) {
                        $q->where('employee_id', $employeeId);
                    })
                    ->count(),
                
                'change_off_schedules' => ChangeOffSchedule::whereBetween('original_date', [$startDate, $endDate])
                    ->when($department, function($q) use ($department) {
                        $q->whereHas('employee', function($subQ) use ($department) {
                            $subQ->where('Department', $department);
                        });
                    })
                    ->when($employeeId, function($q) use ($employeeId) {
                        $q->where('employee_id', $employeeId);
                    })
                    ->count(),
                
                'offsets' => Offset::whereBetween('date', [$startDate, $endDate])
                    ->when($department, function($q) use ($department) {
                        $q->whereHas('employee', function($subQ) use ($department) {
                            $subQ->where('Department', $department);
                        });
                    })
                    ->when($employeeId, function($q) use ($employeeId) {
                        $q->where('employee_id', $employeeId);
                    })
                    ->count(),
                
                'overtime' => Overtime::whereBetween('date', [$startDate, $endDate])
                    ->when($department, function($q) use ($department) {
                        $q->whereHas('employee', function($subQ) use ($department) {
                            $subQ->where('Department', $department);
                        });
                    })
                    ->when($employeeId, function($q) use ($employeeId) {
                        $q->where('employee_id', $employeeId);
                    })
                    ->count(),
                
                'slvl' => SLVL::where(function($q) use ($startDate, $endDate) {
                        $q->whereBetween('start_date', [$startDate, $endDate])
                          ->orWhereBetween('end_date', [$startDate, $endDate]);
                    })
                    ->when($department, function($q) use ($department) {
                        $q->whereHas('employee', function($subQ) use ($department) {
                            $subQ->where('Department', $department);
                        });
                    })
                    ->when($employeeId, function($q) use ($employeeId) {
                        $q->where('employee_id', $employeeId);
                    })
                    ->count(),
                
                'travel_orders' => TravelOrder::where(function($q) use ($startDate, $endDate) {
                        $q->whereBetween('start_date', [$startDate, $endDate])
                          ->orWhereBetween('end_date', [$startDate, $endDate]);
                    })
                    ->when($department, function($q) use ($department) {
                        $q->whereHas('employee', function($subQ) use ($department) {
                            $subQ->where('Department', $department);
                        });
                    })
                    ->when($employeeId, function($q) use ($employeeId) {
                        $q->where('employee_id', $employeeId);
                    })
                    ->count(),
            ]
        ];

        return $syncStats;
    }

    /**
     * Get data for export functionality.
     */
    private function getExportData($year, $month, $periodType, $department = null)
    {
        $query = PayrollSummary::forPeriod($year, $month, $periodType)
            ->with('employee:id,idno,Fname,Lname,Department,Line,CostCenter,Jobtitle')
            ->when($department, function($q) use ($department) {
                $q->where('department', $department);
            });

        return $query->get()->map(function($summary) {
            return [
                'Employee ID' => $summary->employee->idno ?? '',
                'Employee Name' => trim(($summary->employee->Fname ?? '') . ' ' . ($summary->employee->Lname ?? '')),
                'Department' => $summary->employee->Department ?? '',
                'Line' => $summary->employee->Line ?? '',
                'Cost Center' => $summary->employee->CostCenter ?? '',
                'Job Title' => $summary->employee->Jobtitle ?? '',
                'Days Worked' => $summary->days_worked,
                'OT Hours' => $summary->ot_hours,
                'Off Days' => $summary->off_days,
                'Late/Under Minutes' => $summary->late_under_minutes,
                'NSD Hours' => $summary->nsd_hours,
                'SLVL Days' => $summary->slvl_days,
                'Retro' => $summary->retro,
                'Travel Order Hours' => $summary->travel_order_hours,
                'Holiday Hours' => $summary->holiday_hours,
                'Offset Hours' => $summary->offset_hours,
                'Trip Count' => $summary->trip_count,
                'Has CT' => $summary->has_ct ? 'Yes' : 'No',
                'Has CS' => $summary->has_cs ? 'Yes' : 'No',
                'Has OB' => $summary->has_ob ? 'Yes' : 'No',
                'Status' => $summary->status,
                'Total Deductions' => $summary->total_deductions,
                'Total Benefits' => $summary->total_benefits,
            ];
        });
    }

    /**
     * Generate export file in the requested format.
     */
    private function generateExportFile($data, $filename, $format)
    {
        // This would implement the actual file generation logic
        // For now, returning a JSON response as placeholder
        return response()->json([
            'success' => true,
            'message' => 'Export functionality placeholder',
            'data' => $data->take(5), // Just show first 5 records as sample
            'filename' => $filename,
            'format' => $format
        ]);
    }
}