'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { DateRange } from 'react-day-picker';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { 
  Database, 
  Plus, 
  Trash2, 
  Edit, 
  Search, 
  SlidersHorizontal, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  User,
  MapPin,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { 
  useAdminFeedbacks, 
  createFeedback, 
  editFeedback, 
  deleteFeedback 
} from '@/hooks/use-admin-feedbacks';
import type { FeedbackDoc } from '@/lib/feedback-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/ui/date-range-picker';

export default function AdminCrud() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const { feedbacks, loading, mutate } = useAdminFeedbacks();

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterLocation, setFilterLocation] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Dialog / Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCategory, setFormCategory] = useState<'Reliability' | 'Support' | 'FieldSupport' | 'Testimonials' | 'Installation' | 'Billing'>('Reliability');
  const [formLocation, setFormLocation] = useState('Ibadan');
  const [formPlan, setFormPlan] = useState('Enterprise');
  const [formComment, setFormComment] = useState('');
  const [formStaffName, setFormStaffName] = useState('');
  const [formDateFeedback, setFormDateFeedback] = useState('');
  const [formStatus, setFormStatus] = useState<'open' | 'resolved' | 'escalated'>('open');
  const [formNotes, setFormNotes] = useState('');
  
  // Dynamic Ratings form state
  const [ratingsState, setRatingsState] = useState<Record<string, string>>({});

  const categories = ['Reliability', 'Support', 'FieldSupport', 'Testimonials', 'Installation', 'Billing'];
  const locations = ['Ibadan', 'Abeokuta', 'Akure', 'Osogbo'];

  // Categories mapping
  const categoryFields: Record<string, { key: string; label: string; type: 'rating' | 'select'; options?: string[] }[]> = {
    Reliability: [
      { key: 'stability', label: 'Stability Rating (1-5)', type: 'rating' },
      { key: 'latency', label: 'Latency Rating (1-5)', type: 'rating' },
      { key: 'peakPerformance', label: 'Peak Performance Rating (1-5)', type: 'rating' },
    ],
    Support: [
      { key: 'professionalism', label: 'Professionalism Rating (1-5)', type: 'rating' },
      { key: 'clarity', label: 'Clarity Rating (1-5)', type: 'rating' },
      { key: 'responsiveness', label: 'Response Speed (1-5)', type: 'rating' },
      { key: 'knowledge', label: 'Agent Knowledge (1-5)', type: 'rating' },
      { key: 'friendliness', label: 'Agent Friendliness (1-5)', type: 'rating' },
      { key: 'fcr', label: 'First Contact Resolved?', type: 'select', options: ['Yes', 'No'] },
    ],
    FieldSupport: [
      { key: 'resolutionSpeed', label: 'Resolution Speed (1-5)', type: 'rating' },
      { key: 'repairQuality', label: 'Repair Quality (1-5)', type: 'rating' },
      { key: 'conduct', label: 'Technician Conduct (1-5)', type: 'rating' },
    ],
    Testimonials: [
      { key: 'signal', label: 'Overall Signal Rating (1-5)', type: 'rating' },
    ],
    Installation: [
      { key: 'punctuality', label: 'Punctuality Rating (1-5)', type: 'rating' },
      { key: 'quality', label: 'Installation Quality Rating (1-5)', type: 'rating' },
      { key: 'explanation', label: 'Technician Explanation (1-5)', type: 'rating' },
      { key: 'timeliness', label: 'Installation Speed (1-5)', type: 'rating' },
    ],
    Billing: [
      { key: 'accuracy', label: 'Invoice Accuracy Rating (1-5)', type: 'rating' },
      { key: 'reconnection', label: 'Internet Restoration Rating (1-5)', type: 'rating' },
      { key: 'usedPortal', label: 'Used Payment Portal?', type: 'select', options: ['Yes', 'No'] },
      { key: 'portalEase', label: 'Portal Ease of Use Rating (1-5)', type: 'rating' },
    ]
  };

  // Reset form helper
  const resetForm = useCallback((record?: FeedbackDoc) => {
    if (record) {
      setFormName(record.customerName || '');
      setFormEmail(record.customerEmail || '');
      setFormCategory((record.category || 'Reliability') as 'Reliability' | 'Support' | 'FieldSupport' | 'Testimonials' | 'Installation' | 'Billing');
      setFormLocation(record.location || 'Ibadan');
      setFormPlan(record.servicePlan || 'Enterprise');
      setFormComment(record.comment || '');
      setFormStaffName(record.staffName || '');
      setFormStatus((record.status || 'open') as 'open' | 'resolved' | 'escalated');
      setFormNotes(record.resolutionNotes || '');
      
      const formattedDate = record.dateFeedback 
        ? new Date(record.dateFeedback).toISOString().substring(0, 10)
        : record.timestamp
        ? new Date(record.timestamp).toISOString().substring(0, 10)
        : new Date().toISOString().substring(0, 10);
      setFormDateFeedback(formattedDate);

      // Pre-fill ratings
      const initialRatings: Record<string, string> = {};
      const fields = categoryFields[record.category ?? ''] || [];
      fields.forEach((f: { key: string; label: string; type: 'rating' | 'select'; options?: string[] }) => {
        initialRatings[f.key] = String(record.ratings?.[f.key] || '');
      });
      setRatingsState(initialRatings);
    } else {
      setFormName('');
      setFormEmail('');
      setFormCategory('Reliability');
      setFormLocation('Ibadan');
      setFormPlan('Enterprise');
      setFormComment('');
      setFormStaffName('');
      setFormDateFeedback(new Date().toISOString().substring(0, 10));
      setFormStatus('open');
      setFormNotes('');
      setRatingsState({});
    }
  }, []);

  // Filtered feedbacks
  const filteredFeedbacks = useMemo(() => {
    if (!feedbacks) return [];
    return feedbacks.filter((f: FeedbackDoc) => {
      const matchesSearch = 
        f.customerName?.toLowerCase().includes(search.toLowerCase()) || 
        f.comment?.toLowerCase().includes(search.toLowerCase()) ||
        f.customerEmail?.toLowerCase().includes(search.toLowerCase());
        
      const matchesCategory = filterCategory === 'ALL' || f.category === filterCategory;
      const matchesLocation = filterLocation === 'ALL' || f.location === filterLocation;
      const matchesStatus = filterStatus === 'ALL' || f.status === filterStatus;

      let matchesDate = true;
      if (dateRange?.from || dateRange?.to) {
        const ts = f.timestamp ?? 0;
        if (dateRange.from && ts < dateRange.from.getTime()) matchesDate = false;
        if (dateRange.to) {
          const endOfDay = new Date(dateRange.to);
          endOfDay.setHours(23, 59, 59, 999);
          if (ts > endOfDay.getTime()) matchesDate = false;
        }
      }
      
      return matchesSearch && matchesCategory && matchesLocation && matchesStatus && matchesDate;
    });
  }, [feedbacks, search, filterCategory, filterLocation, filterStatus, dateRange]);

  // Paginated feedbacks
  const paginatedFeedbacks = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredFeedbacks.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredFeedbacks, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filteredFeedbacks.length / itemsPerPage));

  // Action handlers
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsActionLoading(true);
    try {
      const parsedRatings: Record<string, any> = {};
      Object.entries(ratingsState).forEach(([key, val]) => {
        if (val) {
          parsedRatings[key] = isNaN(Number(val)) ? val : Number(val);
        }
      });

      const payload = {
        customerName: formName,
        customerEmail: formEmail,
        category: formCategory,
        location: formLocation,
        servicePlan: formPlan,
        comment: formComment,
        staffName: formStaffName,
        dateFeedback: formDateFeedback,
        dateSubmitted: new Date().toISOString(),
        ratings: parsedRatings
      };

      await createFeedback(payload, user);
      toast({ title: "Feedback Logged", description: "Successfully created feedback record." });
      mutate();
      setIsCreateOpen(false);
      resetForm();
    } catch (err: unknown) {
      console.error(err);
      toast({ variant: "destructive", title: "Creation Failed", description: err instanceof Error ? err.message : 'Error' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedRecord) return;
    setIsActionLoading(true);
    try {
      const parsedRatings: Record<string, any> = {};
      Object.entries(ratingsState).forEach(([key, val]) => {
        if (val) {
          parsedRatings[key] = isNaN(Number(val)) ? val : Number(val);
        }
      });

      const payload = {
        customerName: formName,
        customerEmail: formEmail,
        category: formCategory,
        location: formLocation,
        servicePlan: formPlan,
        comment: formComment,
        staffName: formStaffName,
        dateFeedback: formDateFeedback,
        status: formStatus,
        resolutionNotes: formNotes,
        ratings: parsedRatings
      };

      await editFeedback(selectedRecord.id, payload, user);
      toast({ title: "Feedback Updated", description: "Successfully updated record." });
      mutate();
      setIsEditOpen(false);
      setSelectedRecord(null);
    } catch (err: unknown) {
      console.error(err);
      toast({ variant: "destructive", title: "Update Failed", description: err instanceof Error ? err.message : 'Error' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !selectedRecord) return;
    setIsActionLoading(true);
    try {
      await deleteFeedback(selectedRecord.id, user);
      toast({ title: "Feedback Deleted", description: "Successfully removed record." });
      mutate();
      setIsDeleteOpen(false);
      setSelectedRecord(null);
    } catch (err: unknown) {
      console.error(err);
      toast({ variant: "destructive", title: "Delete Failed", description: err instanceof Error ? err.message : 'Error' });
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-container-max mx-auto px-1 py-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
          <div>
            <h1 className="text-3xl font-display font-bold text-primary uppercase tracking-tight flex items-center gap-3">
              <Database className="w-8 h-8 text-secondary" /> Data Management Center
            </h1>
            <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold mt-2 opacity-65">
              Super-admin feedback CRUD operations & logs controls
            </p>
          </div>
          <Button 
            onClick={() => { resetForm(); setIsCreateOpen(true); }}
            className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 shadow-lg hover:scale-105 transition-transform"
          >
            <Plus className="w-3.5 h-3.5 mr-2" /> Add Record
          </Button>
        </header>

        {/* Filter Section */}
        <section className="bg-white p-6 rounded-2xl border border-border whisper-shadow mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40 text-primary" />
            <Input 
              placeholder="Search by customer name, comment..." 
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-10 rounded-full font-body text-xs border-border"
            />
          </div>
          <div className="flex flex-wrap gap-4 w-full md:w-auto items-center">
            <SlidersHorizontal className="w-4 h-4 opacity-40 hidden lg:block" />
            <Select value={filterCategory} onValueChange={(val) => { setFilterCategory(val); setCurrentPage(1); }}>
              <SelectTrigger className="w-[150px] rounded-full font-mono text-[10px] uppercase font-bold bg-white">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Departments</SelectItem>
                {categories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterLocation} onValueChange={(val) => { setFilterLocation(val); setCurrentPage(1); }}>
              <SelectTrigger className="w-[150px] rounded-full font-mono text-[10px] uppercase font-bold bg-white">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Regions</SelectItem>
                {locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={(val) => { setFilterStatus(val); setCurrentPage(1); }}>
              <SelectTrigger className="w-[150px] rounded-full font-mono text-[10px] uppercase font-bold bg-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
              </SelectContent>
            </Select>

            <DateRangePicker
              from={dateRange?.from}
              to={dateRange?.to}
              onSelect={(range) => { setDateRange(range); setCurrentPage(1); }}
            />
          </div>
        </section>

        {/* Data List Section */}
        <section className="bg-white rounded-2xl border border-border whisper-shadow overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest bg-surface-container-lowest/30">
                  <th className="p-6">Customer Details</th>
                  <th className="p-6">Region</th>
                  <th className="p-6">Department</th>
                  <th className="p-6">Status</th>
                  <th className="p-6">Date</th>
                  <th className="p-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-body text-xs text-on-surface">
                {paginatedFeedbacks.map((f: FeedbackDoc) => (
                  <tr key={f.id} className="hover:bg-surface-container-lowest/40 transition-colors">
                    <td className="p-6">
                      <div className="font-bold text-primary text-sm">{f.customerName}</div>
                      <div className="text-[10px] text-on-surface-variant/70 font-mono mt-0.5">{f.customerEmail}</div>
                    </td>
                    <td className="p-6 font-bold">{f.location}</td>
                    <td className="p-6">
                      <span className="font-mono text-[10px] uppercase font-bold opacity-80">{f.category}</span>
                    </td>
                    <td className="p-6">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[9px] font-mono font-bold uppercase",
                        f.status === 'resolved' ? "bg-green-100 text-green-600" : 
                        f.status === 'open' ? "bg-emerald-50 text-emerald-600 border border-emerald-200/50" : "bg-blue-100 text-blue-600"
                      )}>
                        {f.status}
                      </span>
                    </td>
                    <td className="p-6 font-mono text-[10px] opacity-70">
                      {f.dateFeedback || (f.timestamp ? new Date(f.timestamp).toLocaleDateString() : '—')}
                    </td>
                    <td className="p-6 text-right space-x-2">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => { setSelectedRecord(f); resetForm(f); setIsEditOpen(true); }}
                        className="h-8 w-8 rounded-full text-secondary hover:bg-secondary/10"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => { setSelectedRecord(f); setIsDeleteOpen(true); }}
                        className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}

                {loading && (
                  <tr>
                    <td colSpan={6} className="py-20 text-center font-mono text-xs opacity-60">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-4 text-secondary" />
                      Fetching feedbacks database logs...
                    </td>
                  </tr>
                )}

                {!loading && paginatedFeedbacks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-20 text-center border-t border-border border-dashed">
                      <AlertTriangle className="w-8 h-8 text-secondary/40 mx-auto mb-4" />
                      <p className="font-mono text-sm text-on-surface-variant opacity-50 uppercase font-bold tracking-widest">
                        No Database Records Found
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {filteredFeedbacks.length > 0 && (
            <footer className="border-t border-border p-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-lowest/10">
              <span className="font-mono text-[10px] text-on-surface-variant uppercase font-bold">
                Showing {Math.min(filteredFeedbacks.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(filteredFeedbacks.length, currentPage * itemsPerPage)} of {filteredFeedbacks.length} logs
              </span>
              <div className="flex gap-2">
                <Button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  variant="outline" 
                  className="rounded-full h-8 w-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center px-4 font-mono text-xs font-bold text-primary">
                  Page {currentPage} of {totalPages}
                </div>
                <Button 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  variant="outline" 
                  className="rounded-full h-8 w-8 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </footer>
          )}
        </section>

        {/* CREATE DIALOG MODAL */}
        <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if(!open) resetForm(); }}>
          <DialogContent className="max-w-xl rounded-3xl p-8 max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-tight flex items-center gap-2">
                <Plus className="w-5 h-5 text-secondary" /> Add Customer Record
              </DialogTitle>
              <DialogDescription className="font-mono text-[10px] uppercase font-bold opacity-60">
                Log a new customer feedback record directly in telemetry collection
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Customer Name</label>
                  <Input required placeholder="Lukmon Obasa" value={formName} onChange={(e) => setFormName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Customer Email</label>
                  <Input required type="email" placeholder="l.obasa@iworldnetworks.net" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Department</label>
                  <Select value={formCategory} onValueChange={(val: string) => { setFormCategory(val as "Reliability" | "Support" | "FieldSupport" | "Testimonials" | "Installation" | "Billing"); setRatingsState({}); }}>
                    <SelectTrigger className="rounded-md font-mono text-[10px] uppercase font-bold bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Region</label>
                  <Select value={formLocation} onValueChange={setFormLocation}>
                    <SelectTrigger className="rounded-md font-mono text-[10px] uppercase font-bold bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Service Plan</label>
                  <Input required placeholder="Enterprise" value={formPlan} onChange={(e) => setFormPlan(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Staff / Tech Name</label>
                  <Input placeholder="Christian Adejo" value={formStaffName} onChange={(e) => setFormStaffName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Experience Date</label>
                  <Input required type="date" value={formDateFeedback} onChange={(e) => setFormDateFeedback(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Feedback Comment</label>
                <Textarea placeholder="Explain customer concerns or telemetry heartbeat detailed descriptions..." className="min-h-[80px]" value={formComment} onChange={(e) => setFormComment(e.target.value)} />
              </div>

              {/* Dynamic ratings section based on category selection */}
              <div className="border-t border-border pt-6 mt-6">
                <h4 className="font-mono text-[10px] uppercase font-bold text-secondary tracking-widest mb-4">Department Rating Data</h4>
                <div className="grid grid-cols-2 gap-4">
                  {(categoryFields[formCategory] || []).map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">{field.label}</label>
                      {field.type === 'rating' ? (
                        <Select 
                          value={ratingsState[field.key] || ''} 
                          onValueChange={(val) => setRatingsState(prev => ({ ...prev, [field.key]: val }))}
                        >
                          <SelectTrigger className="rounded-md font-mono text-[10px] uppercase font-bold bg-white">
                            <SelectValue placeholder="Rate 1-5" />
                          </SelectTrigger>
                          <SelectContent>
                            {['5', '4', '3', '2', '1'].map(n => <SelectItem key={n} value={n}>{n} Stars</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select 
                          value={ratingsState[field.key] || ''} 
                          onValueChange={(val) => setRatingsState(prev => ({ ...prev, [field.key]: val }))}
                        >
                          <SelectTrigger className="rounded-md font-mono text-[10px] uppercase font-bold bg-white">
                            <SelectValue placeholder="Select choice" />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter className="flex justify-end gap-2 border-t border-border pt-6 mt-6">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isActionLoading} className="rounded-full bg-secondary text-white px-8">
                  {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />} Add Record
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* EDIT DIALOG MODAL */}
        <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if(!open) setSelectedRecord(null); }}>
          <DialogContent className="max-w-xl rounded-3xl p-8 max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-tight flex items-center gap-2">
                <Edit className="w-5 h-5 text-secondary" /> Modify Customer Record
              </DialogTitle>
              <DialogDescription className="font-mono text-[10px] uppercase font-bold opacity-60">
                Update user record properties and review logs telemetry values
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEdit} className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Customer Name</label>
                  <Input required placeholder="Lukmon Obasa" value={formName} onChange={(e) => setFormName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Customer Email</label>
                  <Input required type="email" placeholder="l.obasa@iworldnetworks.net" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Department</label>
                  <Select value={formCategory} onValueChange={(val: string) => { setFormCategory(val as "Reliability" | "Support" | "FieldSupport" | "Testimonials" | "Installation" | "Billing"); setRatingsState({}); }}>
                    <SelectTrigger className="rounded-md font-mono text-[10px] uppercase font-bold bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Region</label>
                  <Select value={formLocation} onValueChange={setFormLocation}>
                    <SelectTrigger className="rounded-md font-mono text-[10px] uppercase font-bold bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Service Plan</label>
                  <Input required placeholder="Enterprise" value={formPlan} onChange={(e) => setFormPlan(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Staff / Tech Name</label>
                  <Input placeholder="Christian Adejo" value={formStaffName} onChange={(e) => setFormStaffName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Experience Date</label>
                  <Input required type="date" value={formDateFeedback} onChange={(e) => setFormDateFeedback(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Status</label>
                  <Select value={formStatus} onValueChange={(val: string) => setFormStatus(val as "open" | "resolved" | "escalated")}>
                    <SelectTrigger className="rounded-md font-mono text-[10px] uppercase font-bold bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="escalated">Escalated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Supervisor Notes</label>
                <Textarea placeholder="Resolution details..." className="min-h-[80px]" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Feedback Comment</label>
                <Textarea placeholder="Explain customer concerns..." className="min-h-[80px]" value={formComment} onChange={(e) => setFormComment(e.target.value)} />
              </div>

              {/* Dynamic ratings section based on category selection */}
              <div className="border-t border-border pt-6 mt-6">
                <h4 className="font-mono text-[10px] uppercase font-bold text-secondary tracking-widest mb-4">Department Rating Data</h4>
                <div className="grid grid-cols-2 gap-4">
                  {(categoryFields[formCategory] || []).map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">{field.label}</label>
                      {field.type === 'rating' ? (
                        <Select 
                          value={ratingsState[field.key] || ''} 
                          onValueChange={(val) => setRatingsState(prev => ({ ...prev, [field.key]: val }))}
                        >
                          <SelectTrigger className="rounded-md font-mono text-[10px] uppercase font-bold bg-white">
                            <SelectValue placeholder="Rate 1-5" />
                          </SelectTrigger>
                          <SelectContent>
                            {['5', '4', '3', '2', '1'].map(n => <SelectItem key={n} value={n}>{n} Stars</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select 
                          value={ratingsState[field.key] || ''} 
                          onValueChange={(val) => setRatingsState(prev => ({ ...prev, [field.key]: val }))}
                        >
                          <SelectTrigger className="rounded-md font-mono text-[10px] uppercase font-bold bg-white">
                            <SelectValue placeholder="Select choice" />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter className="flex justify-end gap-2 border-t border-border pt-6 mt-6">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isActionLoading} className="rounded-full bg-secondary text-white px-8">
                  {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Edit className="w-4 h-4 mr-2" />} Save Changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* DELETE CONFIRMATION DIALOG */}
        <Dialog open={isDeleteOpen} onOpenChange={(open) => { setIsDeleteOpen(open); if(!open) setSelectedRecord(null); }}>
          <DialogContent className="max-w-md rounded-3xl p-8">
            <DialogHeader className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
                <Trash2 className="w-8 h-8 text-destructive animate-bounce" />
              </div>
              <div>
                <DialogTitle className="font-display text-lg uppercase tracking-tight">Delete Feedback Record?</DialogTitle>
                <DialogDescription className="font-body text-xs text-on-surface-variant mt-2 max-w-sm">
                  Are you absolutely sure you want to delete this record? This action is permanent and cannot be undone.
                </DialogDescription>
              </div>
            </DialogHeader>
            <DialogFooter className="flex gap-2 justify-center mt-6 w-full">
              <Button type="button" variant="outline" className="rounded-full flex-1" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
              <Button 
                type="button" 
                onClick={handleDelete} 
                disabled={isActionLoading}
                className="rounded-full bg-destructive text-white hover:bg-destructive/90 flex-1"
              >
                {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Yes, Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
