<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Drop the existing table to recreate with new structure
        Schema::dropIfExists('employee_schedules');
        
        Schema::create('employee_schedules', function (Blueprint $table) {
            $table->id();
            
            // Employee reference
            $table->foreignId('employee_id')->constrained('employees')->onDelete('cascade');
            
            // Shift information
            $table->enum('shift_type', ['regular', 'night', 'flexible', 'rotating'])
                  ->comment('Type of work shift');
            
            // Day of the week - NEW: Individual day instead of JSON array
            $table->enum('work_day', ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
                  ->comment('Specific day of the week for this schedule');
            
            // Time information
            $table->time('start_time')->comment('Daily shift start time');
            $table->time('end_time')->comment('Daily shift end time');
            $table->time('break_start')->nullable()->comment('Break start time');
            $table->time('break_end')->nullable()->comment('Break end time');
            
            // Schedule period
            $table->date('effective_date')->comment('When this schedule becomes effective');
            $table->date('end_date')->nullable()->comment('When this schedule ends (null = ongoing)');
            
            // Status and metadata
            $table->enum('status', ['active', 'inactive', 'pending'])->default('active')
                  ->comment('Current status of the schedule');
            $table->text('notes')->nullable()->comment('Additional notes or comments');
            
            // Audit fields
            $table->foreignId('created_by')->nullable()->constrained('users')->onDelete('set null');
            $table->foreignId('updated_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamps();
            
            // Indexes for better performance
            $table->index(['employee_id', 'status'], 'idx_employee_schedules_employee_status');
            $table->index(['employee_id', 'work_day'], 'idx_employee_schedules_employee_day');
            $table->index(['shift_type', 'status'], 'idx_employee_schedules_shift_status');
            $table->index(['work_day', 'status'], 'idx_employee_schedules_day_status');
            $table->index(['effective_date', 'end_date'], 'idx_employee_schedules_date_range');
            $table->index(['status', 'effective_date'], 'idx_employee_schedules_status_effective');
            $table->index('created_at', 'idx_employee_schedules_created_at');
            
            // Composite index for finding current schedules
            $table->index(['employee_id', 'work_day', 'status', 'effective_date'], 'idx_employee_schedules_current');
            
            // Unique constraint to prevent duplicate schedules for same employee, day, and period
            $table->unique(['employee_id', 'work_day', 'effective_date'], 'unique_employee_day_schedule');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('employee_schedules');
        
        // Recreate the original structure if needed
        Schema::create('employee_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->onDelete('cascade');
            $table->enum('shift_type', ['regular', 'night', 'flexible', 'rotating']);
            $table->time('start_time');
            $table->time('end_time');
            $table->time('break_start')->nullable();
            $table->time('break_end')->nullable();
            $table->json('work_days')->comment('Array of working days');
            $table->date('effective_date');
            $table->date('end_date')->nullable();
            $table->enum('status', ['active', 'inactive', 'pending'])->default('active');
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->onDelete('set null');
            $table->foreignId('updated_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamps();
        });
    }
};