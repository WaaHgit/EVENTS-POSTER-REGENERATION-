import React from 'react';
import { STATUS_OPTIONS } from '../lib/utils';

export interface FormData {
  fullName: string;
  contact: string;
  status: string;
  otherStatus: string;
}

interface Props {
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
}

export const AttendeeForm: React.FC<Props> = ({ formData, setFormData }) => {
  return (
    <div className="space-y-4 text-left w-full">
      <div>
        <label htmlFor="attendee-fullname" className="block text-sm font-medium text-slate-700 mb-1.5">
          Full Name
        </label>
        <input
          id="attendee-fullname"
          type="text"
          required
          maxLength={40}
          placeholder="Enter your full name"
          className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 placeholder-slate-400 outline-none transition focus:border-[#0B2776] focus:ring-2 focus:ring-[#0B2776]/10 text-sm"
          value={formData.fullName}
          onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor="attendee-contact" className="block text-sm font-medium text-slate-700 mb-1.5">
          Contact
        </label>
        <input
          id="attendee-contact"
          type="text"
          required
          placeholder="Phone number or email"
          className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 placeholder-slate-400 outline-none transition focus:border-[#0B2776] focus:ring-2 focus:ring-[#0B2776]/10 text-sm"
          value={formData.contact}
          onChange={(e) => setFormData(prev => ({ ...prev, contact: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor="attendee-status" className="block text-sm font-medium text-slate-700 mb-1.5">
          Status / Role
        </label>
        <div className="relative">
          <select
            id="attendee-status"
            required
            className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-[#0B2776] focus:ring-2 focus:ring-[#0B2776]/10 appearance-none cursor-pointer text-sm pr-10"
            value={formData.status}
            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="">Select your status / role</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
            ▼
          </div>
        </div>
      </div>

      {formData.status === 'Other' && (
        <div>
          <label htmlFor="attendee-other-status" className="block text-sm font-medium text-slate-700 mb-1.5">
            Please specify
          </label>
          <input
            id="attendee-other-status"
            type="text"
            required
            placeholder="Specify your designation"
            className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 placeholder-slate-400 outline-none transition focus:border-[#0B2776] focus:ring-2 focus:ring-[#0B2776]/10 text-sm"
            value={formData.otherStatus}
            onChange={(e) => setFormData(prev => ({ ...prev, otherStatus: e.target.value }))}
          />
        </div>
      )}
    </div>
  );
};
