"use client";
import { Building2, BookOpen, ShieldCheck, PartyPopper, Lightbulb } from "lucide-react";

const CATEGORIES = [
  { id: "Facilities",   icon: Building2,    label: "Facilities" },
  { id: "Learning",     icon: BookOpen,     label: "Learning" },
  { id: "Safety",       icon: ShieldCheck,  label: "Safety" },
  { id: "Student life", icon: PartyPopper,  label: "Student Life" },
  { id: "Other",        icon: Lightbulb,    label: "Other" },
];

export function CategoryPicker({
  value, onChange,
}: {
  value: string;
  onChange: (cat: string) => void;
}) {
  return (
    <div className="category-picker" role="radiogroup" aria-label="Category">
      {CATEGORIES.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          className={`cat-btn${value === id ? " selected" : ""}`}
          onClick={() => onChange(id)}
        >
          <Icon className="cat-icon" size={22} strokeWidth={1.75} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
