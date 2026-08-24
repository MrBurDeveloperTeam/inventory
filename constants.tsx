
import React from 'react';
import {
  Package,
  Stethoscope,
  Scissors,
  Droplets,
  Pill,
  ShieldCheck,
  Box
} from 'lucide-react';
import { Category } from './types';

export const CATEGORIES = [
  { id: 'consumables', label: 'Consumables', icon: <Package className="w-4 h-4" /> },
  { id: 'equipment', label: 'Equipment', icon: <Stethoscope className="w-4 h-4" /> },
  { id: 'instruments', label: 'Instruments', icon: <Scissors className="w-4 h-4" /> },
  { id: 'materials', label: 'Materials', icon: <Droplets className="w-4 h-4" /> },
  { id: 'medication', label: 'Medication', icon: <Pill className="w-4 h-4" /> },
  { id: 'ppe', label: 'PPE', icon: <ShieldCheck className="w-4 h-4" /> },
  { id: 'other', label: 'Other', icon: <Box className="w-4 h-4" /> },
];

export const UOMS = ['pcs', 'box'];

export const CATEGORY_ORDER = ['consumables', 'equipment', 'instruments', 'materials', 'medication', 'ppe', 'other'];

/**
 * Categories treated as "liquid" stock for the low-stock reorder check (see
 * services/lowStockReorder.ts). There's no per-item liquid/solid flag in the
 * data model, so this is inferred from category: 'materials' (impression
 * material, disinfectants, bonding/etching liquids — already given the
 * Droplets icon above) and 'medication' (rinses, injectable/liquid meds) are
 * treated as liquid; everything else (consumables, equipment, instruments,
 * ppe, other) is treated as non-liquid and is eligible for the qty<=2
 * auto-reorder prompt. Adjust this list if your categorization differs.
 */
export const LIQUID_CATEGORIES: Category[] = ['materials', 'medication'];

export const isLiquidCategory = (category: Category): boolean =>
  LIQUID_CATEGORIES.includes(category);

export const PRESET_BLUEPRINTS = [
  {
    id: 'template-1',
    name: 'Blue Lab',
    url: '/images/template1.png',
    description: 'Advanced blue laboratory aesthetic'
  },
  {
    id: 'template-2',
    name: 'City Clinic',
    url: '/images/template2.png',
    description: 'Wide isometric city-clinic layout'
  },
  {
    id: 'template-3',
    name: 'Classic Layout',
    url: '/images/template3.png',
    description: 'Alternate clinic layout'
  },
  {
    id: 'template-4',
    name: 'Treatment Hub',
    url: '/images/template4.png',
    description: 'High-density treatment layout'
  },
  {
    id: 'template-5',
    name: 'Open Floor',
    url: '/images/template5.png',
    description: 'Open concept clinic floor'
  },
];
