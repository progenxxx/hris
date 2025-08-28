<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Carbon\Carbon;

class EmployeeSchedule extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'shift_type',
        'work_day',           // NEW: Individual day instead of work_days array
        'start_time',
        'end_time',
        'break_start',
        'break_end',
        'effective_date',
        'end_date',
        'status',
        'notes',
        'created_by',
        'updated_by'
    ];

    protected $casts = [
        'effective_date' => 'date',
        'end_date' => 'date',
        // Removed work_days cast since we're now using individual work_day
    ];

    /**
     * Available work days
     */
    public static $workDays = [
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
    ];

    /**
     * Get the employee that owns the schedule.
     */
    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    /**
     * Get the user who created the schedule.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the user who last updated the schedule.
     */
    public function updater()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Scope for active schedules.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope for inactive schedules.
     */
    public function scopeInactive($query)
    {
        return $query->where('status', 'inactive');
    }

    /**
     * Scope for pending schedules.
     */
    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    /**
     * Scope for current schedules (effective today).
     */
    public function scopeCurrent($query)
    {
        $today = Carbon::today();
        return $query->where('effective_date', '<=', $today)
            ->where(function($q) use ($today) {
                $q->whereNull('end_date')
                  ->orWhere('end_date', '>=', $today);
            });
    }

    /**
     * Scope for schedules by shift type.
     */
    public function scopeByShiftType($query, $shiftType)
    {
        return $query->where('shift_type', $shiftType);
    }

    /**
     * Scope for schedules by work day.
     */
    public function scopeByWorkDay($query, $workDay)
    {
        return $query->where('work_day', $workDay);
    }

    /**
     * Scope for schedules by department.
     */
    public function scopeByDepartment($query, $department)
    {
        return $query->whereHas('employee', function($q) use ($department) {
            $q->where('Department', $department);
        });
    }

    /**
     * Scope for schedules effective within a date range.
     */
    public function scopeEffectiveBetween($query, $startDate, $endDate)
    {
        return $query->where(function($q) use ($startDate, $endDate) {
            $q->where('effective_date', '<=', $endDate)
              ->where(function($subQ) use ($startDate) {
                  $subQ->whereNull('end_date')
                       ->orWhere('end_date', '>=', $startDate);
              });
        });
    }

    /**
     * Check if the schedule is currently active.
     */
    public function isCurrentlyActive()
    {
        if ($this->status !== 'active') {
            return false;
        }

        $today = Carbon::today();
        
        if ($this->effective_date > $today) {
            return false;
        }

        if ($this->end_date && $this->end_date < $today) {
            return false;
        }

        return true;
    }

    /**
     * Check if the schedule applies to a specific day of the week.
     */
    public function appliesToDay($dayOfWeek)
    {
        $dayNames = [
            0 => 'sunday',
            1 => 'monday',
            2 => 'tuesday',
            3 => 'wednesday',
            4 => 'thursday',
            5 => 'friday',
            6 => 'saturday'
        ];

        $dayName = $dayNames[$dayOfWeek] ?? null;
        
        return $dayName && $this->work_day === $dayName;
    }

    /**
     * Get the total work hours per day.
     */
    public function getTotalWorkHours()
    {
        if (!$this->start_time || !$this->end_time) {
            return 0;
        }

        $start = Carbon::createFromFormat('H:i', $this->start_time);
        $end = Carbon::createFromFormat('H:i', $this->end_time);

        // Handle overnight shifts
        if ($end->lt($start)) {
            $end->addDay();
        }

        $totalMinutes = $end->diffInMinutes($start);

        // Subtract break time if specified
        if ($this->break_start && $this->break_end) {
            $breakStart = Carbon::createFromFormat('H:i', $this->break_start);
            $breakEnd = Carbon::createFromFormat('H:i', $this->break_end);
            
            if ($breakEnd->gt($breakStart)) {
                $breakMinutes = $breakEnd->diffInMinutes($breakStart);
                $totalMinutes -= $breakMinutes;
            }
        }

        return round($totalMinutes / 60, 2);
    }

    /**
     * Get the formatted work time display.
     */
    public function getFormattedWorkTimeAttribute()
    {
        if (!$this->start_time || !$this->end_time) {
            return 'Not set';
        }

        $start = Carbon::createFromFormat('H:i', $this->start_time)->format('g:i A');
        $end = Carbon::createFromFormat('H:i', $this->end_time)->format('g:i A');

        return "{$start} - {$end}";
    }

    /**
     * Get the formatted break time display.
     */
    public function getFormattedBreakTimeAttribute()
    {
        if (!$this->break_start || !$this->break_end) {
            return 'No break set';
        }

        $start = Carbon::createFromFormat('H:i', $this->break_start)->format('g:i A');
        $end = Carbon::createFromFormat('H:i', $this->break_end)->format('g:i A');

        return "{$start} - {$end}";
    }

    /**
     * Get the formatted work day display.
     */
    public function getFormattedWorkDayAttribute()
    {
        return ucfirst($this->work_day);
    }

    /**
     * Get the work day abbreviation.
     */
    public function getWorkDayAbbrevAttribute()
    {
        $dayLabels = [
            'monday' => 'Mon',
            'tuesday' => 'Tue',
            'wednesday' => 'Wed',
            'thursday' => 'Thu',
            'friday' => 'Fri',
            'saturday' => 'Sat',
            'sunday' => 'Sun'
        ];

        return $dayLabels[$this->work_day] ?? ucfirst($this->work_day);
    }

    /**
     * Get the shift type label.
     */
    public function getShiftTypeLabelAttribute()
    {
        $labels = [
            'regular' => 'Regular Shift',
            'night' => 'Night Shift',
            'flexible' => 'Flexible Shift',
            'rotating' => 'Rotating Shift'
        ];

        return $labels[$this->shift_type] ?? ucfirst($this->shift_type);
    }

    /**
     * Get the status label.
     */
    public function getStatusLabelAttribute()
    {
        return ucfirst($this->status);
    }

    /**
     * Get the status color for UI display.
     */
    public function getStatusColorAttribute()
    {
        $colors = [
            'active' => 'green',
            'inactive' => 'red',
            'pending' => 'yellow'
        ];

        return $colors[$this->status] ?? 'gray';
    }

    /**
     * Get employee's schedules grouped by employee.
     */
    public static function getEmployeeSchedulesGrouped($filters = [])
    {
        $query = static::with(['employee:id,idno,Fname,Lname,Department']);

        // Apply filters
        if (isset($filters['employee_id'])) {
            $query->where('employee_id', $filters['employee_id']);
        }

        if (isset($filters['department'])) {
            $query->byDepartment($filters['department']);
        }

        if (isset($filters['shift_type'])) {
            $query->byShiftType($filters['shift_type']);
        }

        if (isset($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (isset($filters['work_day'])) {
            $query->byWorkDay($filters['work_day']);
        }

        $schedules = $query->orderBy('employee_id')
                          ->orderByRaw("FIELD(work_day, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')")
                          ->get();

        return $schedules->groupBy('employee_id');
    }

    /**
     * Create multiple schedule records for an employee.
     */
    public static function createEmployeeSchedule($employeeId, $scheduleData)
    {
        $workDays = $scheduleData['work_days'] ?? [];
        $createdSchedules = [];

        foreach ($workDays as $workDay) {
            $scheduleRecord = [
                'employee_id' => $employeeId,
                'shift_type' => $scheduleData['shift_type'],
                'work_day' => $workDay,
                'start_time' => $scheduleData['start_time'],
                'end_time' => $scheduleData['end_time'],
                'break_start' => $scheduleData['break_start'] ?? null,
                'break_end' => $scheduleData['break_end'] ?? null,
                'effective_date' => $scheduleData['effective_date'],
                'end_date' => $scheduleData['end_date'] ?? null,
                'status' => $scheduleData['status'] ?? 'active',
                'notes' => $scheduleData['notes'] ?? null,
                'created_by' => auth()->id(),
            ];

            $createdSchedules[] = static::create($scheduleRecord);
        }

        return $createdSchedules;
    }

    /**
     * Update multiple schedule records for an employee.
     */
    public static function updateEmployeeSchedule($employeeId, $effectiveDate, $scheduleData)
    {
        // Delete existing schedules for this employee and effective date
        static::where('employee_id', $employeeId)
              ->where('effective_date', $effectiveDate)
              ->delete();

        // Create new schedules
        return static::createEmployeeSchedule($employeeId, $scheduleData);
    }

    /**
     * Get employee's schedule for a specific date.
     */
    public static function getEmployeeScheduleForDate($employeeId, $date)
    {
        $carbonDate = Carbon::parse($date);
        $dayOfWeek = strtolower($carbonDate->format('l'));

        return static::where('employee_id', $employeeId)
                    ->where('work_day', $dayOfWeek)
                    ->where('effective_date', '<=', $carbonDate)
                    ->where(function($q) use ($carbonDate) {
                        $q->whereNull('end_date')
                          ->orWhere('end_date', '>=', $carbonDate);
                    })
                    ->where('status', 'active')
                    ->orderBy('effective_date', 'desc')
                    ->first();
    }

    /**
     * Get statistics for schedules.
     */
    public static function getStatistics($filters = [])
    {
        $query = static::query();

        // Apply filters
        if (isset($filters['department'])) {
            $query->byDepartment($filters['department']);
        }

        if (isset($filters['shift_type'])) {
            $query->byShiftType($filters['shift_type']);
        }

        if (isset($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        $total = $query->count();
        $active = $query->clone()->where('status', 'active')->count();
        $inactive = $query->clone()->where('status', 'inactive')->count();
        $pending = $query->clone()->where('status', 'pending')->count();

        // Get shift type counts
        $shiftCounts = $query->clone()
            ->select('shift_type', \DB::raw('count(*) as count'))
            ->groupBy('shift_type')
            ->pluck('count', 'shift_type')
            ->toArray();

        // Get work day counts
        $dayDistribution = $query->clone()
            ->select('work_day', \DB::raw('count(*) as count'))
            ->groupBy('work_day')
            ->orderByRaw("FIELD(work_day, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')")
            ->pluck('count', 'work_day')
            ->toArray();

        return [
            'total' => $total,
            'active' => $active,
            'inactive' => $inactive,
            'pending' => $pending,
            'shift_types' => $shiftCounts,
            'day_distribution' => $dayDistribution
        ];
    }

    /**
     * Boot method to handle model events.
     */
    protected static function boot()
    {
        parent::boot();

        static::creating(function ($schedule) {
            if (auth()->check()) {
                $schedule->created_by = auth()->id();
            }
        });

        static::updating(function ($schedule) {
            if (auth()->check()) {
                $schedule->updated_by = auth()->id();
            }
        });
    }
}