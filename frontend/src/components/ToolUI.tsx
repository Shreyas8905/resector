"use client";

import React, { useState } from 'react';
import { Search, FileText, AlertTriangle, Lightbulb } from 'lucide-react';

interface ToolProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

export function ToolLayout({ title, description, icon, children }: ToolProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-zinc-800 rounded-lg text-zinc-100">
          {icon}
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-zinc-400 text-sm">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function ToolInput({ label, placeholder, value, onChange }: { label: string, placeholder: string, value: string, onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-40 bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 transition-all resize-none"
      />
    </div>
  );
}

export function ToolOutput({ content, isLoading }: { content: string, isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="p-6 border border-zinc-800 rounded-xl bg-zinc-900/30 animate-pulse space-y-4">
        <div className="h-4 bg-zinc-800 rounded w-3/4" />
        <div className="h-4 bg-zinc-800 rounded w-1/2" />
        <div className="h-4 bg-zinc-800 rounded w-5/6" />
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="p-6 border border-zinc-800 rounded-xl bg-zinc-900/50 prose prose-invert max-w-none">
      <div className="whitespace-pre-wrap text-zinc-300 leading-relaxed">
        {content}
      </div>
    </div>
  );
}
