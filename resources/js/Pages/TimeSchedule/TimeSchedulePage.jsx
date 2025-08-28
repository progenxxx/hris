import React, { useState, useEffect } from 'react';
import { router, usePage } from '@inertiajs/react';
import { Head } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Sidebar from '@/Components/Sidebar';
import TimeScheduleList from './TimeScheduleList';
import TimeScheduleForm from './TimeScheduleForm';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Clock, Plus, ListFilter } from 'lucide-react';

const TimeSchedulePage = () => {
    const { props } = usePage();
    const { auth, flash = {}, userRoles = {}, timeSchedules = [], employees = [], departments = [], scheduleTypes = [] } = props;
    
    // State to manage component data
    const [timeScheduleData, setTimeScheduleData] = useState(timeSchedules);
    const [activeTab, setActiveTab] = useState('create'); // Changed from 'list' to 'create'
    const [processing, setProcessing] = useState(false);
    
    // Display flash messages
    useEffect(() => {
        if (flash && flash.message) {
            toast.success(flash.message);
        }
        if (flash && flash.error) {
            toast.error(flash.error);
        }
    }, [flash]);
    
    // Handle form submission
    const handleSubmitTimeSchedule = (formData) => {
        router.post(route('time-schedules.store'), formData, {
            onSuccess: (page) => {
                // Update time schedules list with the new data from the response
                if (page.props.timeSchedules) {
                    setTimeScheduleData(page.props.timeSchedules);
                }
                toast.success('Time schedule change requests created successfully');
                /* setActiveTab('list');  */
            },
            onError: (errors) => {
                if (errors && typeof errors === 'object') {
                    Object.keys(errors).forEach(key => {
                        toast.error(errors[key]);
                    });
                } else {
                    toast.error('An error occurred while submitting form');
                }
            }
        });
    };
    
    // Handle status updates (approve/reject)
    const handleStatusUpdate = (id, data) => {
        if (processing) return;
        
        setProcessing(true);
        
        router.post(route('time-schedules.updateStatus', id), data, {
            preserveScroll: true,
            onSuccess: (page) => {
                // Update time schedules list
                if (page.props.timeSchedules) {
                    setTimeScheduleData(page.props.timeSchedules);
                }
                toast.success('Time schedule change status updated successfully');
                setProcessing(false);
            },
            onError: (errors) => {
                let errorMessage = 'An error occurred while updating status';
                if (errors && typeof errors === 'object') {
                    errorMessage = Object.values(errors).join(', ');
                }
                toast.error(errorMessage);
                setProcessing(false);
            }
        });
    };
    
    // Handle deletion
    const handleDeleteTimeSchedule = (id) => {
        if (confirm('Are you sure you want to delete this time schedule change request?')) {
            router.delete(route('time-schedules.destroy', id), {
                preserveScroll: true,
                onSuccess: (page) => {
                    // Update time schedules list
                    if (page.props.timeSchedules) {
                        setTimeScheduleData(page.props.timeSchedules);
                    } else {
                        // Remove the deleted item from the current state
                        setTimeScheduleData(timeScheduleData.filter(ts => ts.id !== id));
                    }
                    toast.success('Time schedule change request deleted successfully');
                },
                onError: () => toast.error('Failed to delete time schedule change request')
            });
        }
    };
    
    return (
        <AuthenticatedLayout user={auth.user}>
            <Head title="Time Schedule Change Management" />
            
            <div className="flex min-h-screen bg-gray-50">
                {/* Include the Sidebar */}
                <Sidebar />
                
                {/* Main Content */}
                <div className="flex-1 p-8 ml-0">
                    <div className="max-w-7xl mx-auto">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 mb-1">
                                    <Clock className="inline-block w-7 h-7 mr-2 text-indigo-600" />
                                    Time Schedule Change Management
                                </h1>
                                <p className="text-gray-600">
                                    Manage employee time schedule change requests
                                </p>
                            </div>
                        </div>
                
                        <div className="bg-white overflow-hidden shadow-sm rounded-lg">
                            <div className="p-6 bg-white border-b border-gray-200">
                                <div className="mb-6">
                                    <div className="border-b border-gray-200">
                                        <nav className="-mb-px flex space-x-8">
                                            <button
                                                className={`${
                                                    activeTab === 'create'
                                                        ? 'border-indigo-500 text-indigo-600'
                                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                                                onClick={() => setActiveTab('create')}
                                            >
                                                <Plus className="w-4 h-4 mr-2" />
                                                New Time Schedule Change
                                            </button>

                                            <button
                                                className={`${
                                                    activeTab === 'list'
                                                        ? 'border-indigo-500 text-indigo-600'
                                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                                                onClick={() => setActiveTab('list')}
                                            >
                                                <ListFilter className="w-4 h-4 mr-2" />
                                                View Time Schedule Changes
                                                <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                                                        {timeScheduleData.length}
                                                    </span>
                                            </button>
                                            
                                        </nav>
                                    </div>
                                </div>
                                
                                {activeTab === 'list' ? (
                                    <TimeScheduleList 
                                        timeSchedules={timeScheduleData} 
                                        onStatusUpdate={handleStatusUpdate}
                                        onDelete={handleDeleteTimeSchedule}
                                        userRoles={userRoles}
                                    />
                                ) : (
                                    <TimeScheduleForm 
                                        employees={employees} 
                                        departments={departments}
                                        scheduleTypes={scheduleTypes}
                                        onSubmit={handleSubmitTimeSchedule}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <ToastContainer position="top-right" autoClose={3000} />
        </AuthenticatedLayout>
    );
};

export default TimeSchedulePage;