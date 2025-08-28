<?php
// app/Models/TravelOrder.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class TravelOrder extends Model
{
    use HasFactory;

    protected $table = 'travel_orders';

    protected $fillable = [
        'employee_id',
        'start_date',
        'end_date',
        'departure_time',
        'return_time',
        'destination',
        'transportation_type',
        'purpose',
        'accommodation_required',
        'meal_allowance',
        'other_expenses',
        'estimated_cost',
        'return_to_office',
        'office_return_time',
        'total_days',
        'working_days',
        'is_full_day',
        'status',
        'approved_by',
        'approved_at',
        'remarks',
        'created_by',
        'document_paths',
        // Force approval fields
        'force_approved',
        'force_approved_by',
        'force_approved_at',
        'force_approve_remarks',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'departure_time' => 'datetime',
        'return_time' => 'datetime',
        'return_to_office' => 'boolean',
        'office_return_time' => 'datetime',
        'total_days' => 'integer',
        'working_days' => 'integer',
        'is_full_day' => 'boolean',
        'accommodation_required' => 'boolean',
        'meal_allowance' => 'boolean',
        'estimated_cost' => 'decimal:2',
        'approved_at' => 'datetime',
        'document_paths' => 'array',
        'force_approved' => 'boolean',
        'force_approved_at' => 'datetime',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function forceApprover()
    {
        return $this->belongsTo(User::class, 'force_approved_by');
    }

    /**
     * Get the documents as an array
     */
    public function getDocuments()
    {
        return $this->document_paths ? json_decode($this->document_paths, true) : [];
    }

    /**
     * Check if travel order has documents
     */
    public function hasDocuments()
    {
        return !empty($this->document_paths);
    }

    /**
     * Get document count
     */
    public function getDocumentCount()
    {
        return count($this->getDocuments());
    }

    /**
     * Get document names with URLs
     */
    public function getDocumentDetails()
    {
        $documents = $this->getDocuments();
        $details = [];
        
        foreach ($documents as $index => $path) {
            $filename = basename($path);
            $details[] = [
                'index' => $index,
                'filename' => $filename,
                'path' => $path,
                'url' => route('travel-orders.download-document', ['id' => $this->id, 'index' => $index]),
                'size' => file_exists(storage_path('app/public/' . $path)) ? 
                    filesize(storage_path('app/public/' . $path)) : 0,
            ];
        }
        
        return $details;
    }

    /**
     * Check if this travel order was force approved
     */
    public function isForceApproved()
    {
        return $this->force_approved === true;
    }

    /**
     * Helper methods for status checks
     */
    public function isPending()
    {
        return $this->status === 'pending';
    }

    public function isApproved()
    {
        return $this->status === 'approved';
    }

    public function isRejected()
    {
        return $this->status === 'rejected';
    }

    public function isCompleted()
    {
        return $this->status === 'completed';
    }

    public function isCancelled()
    {
        return $this->status === 'cancelled';
    }
}