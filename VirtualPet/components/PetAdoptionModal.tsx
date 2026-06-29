import React, { useState } from 'react';
import { PET_OPTIONS, normalizePetId, type PetId } from '../petOptions';
import { useGameState } from '../context/GameStateContext';

const PetAdoptionModal: React.FC = () => {
  const { hasAdoptedPet, isPetAdoptionReady, adoptPet } = useGameState();
  const [selectedPetId, setSelectedPetId] = useState<PetId>('mallow');
  const [confirmPetId, setConfirmPetId] = useState<PetId | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isPetAdoptionReady || hasAdoptedPet) return null;

  const selectedPet = PET_OPTIONS.find((pet) => pet.id === selectedPetId) || PET_OPTIONS[0];
  const confirmPet = confirmPetId
    ? PET_OPTIONS.find((pet) => pet.id === confirmPetId) || selectedPet
    : null;

  const handleSelect = (petId: string) => {
    setSelectedPetId(normalizePetId(petId));
    setConfirmPetId(null);
    setError('');
  };

  const handleConfirmRequest = () => {
    setConfirmPetId(selectedPetId);
    setError('');
  };

  const handleConfirm = async () => {
    if (!confirmPetId || isSaving) return;
    setIsSaving(true);
    setError('');
    const saved = await adoptPet(confirmPetId);
    if (!saved) {
      setError('Could not save your pet choice. Please try again.');
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
  };

  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-[560px] rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-2xl">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-500">Adopt Your Pet</p>
          <h2 className="mt-2 text-3xl font-black text-slate-800">Choose one cat</h2>
          <p className="mx-auto mt-2 max-w-[420px] text-sm font-semibold leading-6 text-slate-500">
            This pet will be shared across all Snabbb apps. Once confirmed, it cannot be changed.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PET_OPTIONS.map((pet) => {
            const isSelected = pet.id === selectedPetId;
            return (
              <button
                key={pet.id}
                type="button"
                onClick={() => handleSelect(pet.id)}
                className={`min-h-[118px] rounded-2xl border p-3 transition-all ${isSelected ? 'border-emerald-500 bg-emerald-50 text-emerald-600 shadow-lg shadow-emerald-100' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50'}`}
              >
                <span
                  aria-hidden="true"
                  className="mx-auto block"
                  style={{
                    width: 52,
                    height: 56,
                    backgroundImage: `url("${pet.spriteSheetUrl}")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: `${192 * 8 * 0.27}px ${208 * 9 * 0.27}px`,
                    backgroundPosition: '0 0',
                    imageRendering: 'pixelated',
                  }}
                />
                <span className="mt-2 block text-base font-black">{pet.label}</span>
              </button>
            );
          })}
        </div>

        {error && <p className="mt-4 text-center text-sm font-bold text-rose-500">{error}</p>}

        <div className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={handleConfirmRequest}
            disabled={isSaving}
            className="h-12 rounded-xl bg-emerald-500 px-7 text-sm font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            Confirm Adoption
          </button>
        </div>
      </div>

      {confirmPet && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-[360px] rounded-[24px] border border-white/70 bg-white p-5 text-center shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-500">Confirm Adoption</p>
            <h3 className="mt-2 text-2xl font-black text-slate-800">Adopt {confirmPet.label}?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              This cat will be saved to your account and cannot be changed later.
            </p>

            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmPetId(null)}
                disabled={isSaving}
                className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSaving}
                className="h-11 rounded-xl bg-emerald-500 px-5 text-sm font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {isSaving ? 'Saving...' : 'Adopt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PetAdoptionModal;
