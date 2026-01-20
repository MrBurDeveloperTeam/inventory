
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { UserProfile, Collaborator, Invitation } from './types';
import { X, Copy, Check, Trash2, Shield, Mail } from 'lucide-react';

interface CollaboratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: UserProfile | null;
}

const CollaboratorModal: React.FC<CollaboratorModalProps> = ({ isOpen, onClose, currentUser }) => {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');
    const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [loading, setLoading] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [generatedLink, setGeneratedLink] = useState<string | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);

    useEffect(() => {
        if (isOpen && currentUser) {
            fetchCollaborators();
            fetchInvitations();
        }
    }, [isOpen, currentUser]);

    const fetchCollaborators = async () => {
        if (!currentUser) return;

        // Step 1: Get collaborator records
        const { data: collabData, error } = await supabase
            .from('collaborators')
            .select('id, owner_id, user_id, role, created_at')
            .eq('owner_id', currentUser.id);

        if (error) {
            console.error('Error fetching collaborators:', error);
            return;
        }

        if (!collabData || collabData.length === 0) {
            setCollaborators([]);
            return;
        }

        // Step 2: Fetch profiles for these users
        const userIds = collabData.map((c: any) => c.user_id);
        const { data: profilesData } = await supabase
            .from('profiles')
            .select('user_id, name, email, avatar_url')
            .in('user_id', userIds);

        const profileMap = new Map<string, any>();
        (profilesData || []).forEach((p: any) => profileMap.set(p.user_id, p));

        // Combine data
        const combined = collabData.map((c: any) => ({
            ...c,
            profile: profileMap.get(c.user_id) || null
        }));

        setCollaborators(combined);
    };

    const fetchInvitations = async () => {
        if (!currentUser) return;
        const { data, error } = await supabase
            .from('invitations')
            .select('*')
            .eq('owner_id', currentUser.id)
            .eq('status', 'pending');

        if (error) console.error('Error fetching invitations:', error);
        else setInvitations(data || []);
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser || !email) return;
        setLoading(true);
        setInviteError(null);
        setGeneratedLink(null);
        setCopySuccess(false);

        try {
            const { data, error } = await supabase.rpc('invite_collaborator', {
                target_email: email,
                target_role: role,
                url_origin: window.location.origin
            });

            if (error) throw error;

            const result = data as { status: string };

            if (result.status === 'added') {
                alert(`User ${email} already has an account and has been added to your team directly! Email notification sent.`);
                fetchCollaborators();
            } else {
                alert(`Invitation sent to ${email}. They will be added automatically once they sign up.`);
                fetchInvitations();
            }

            setEmail('');
        } catch (err: any) {
            console.error('Invite error:', err);
            setInviteError(err.message || 'Failed to send invitation');
        } finally {
            setLoading(false);
        }
    };

    const handleCopyLink = () => {
        if (generatedLink) {
            navigator.clipboard.writeText(generatedLink);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        }
    };

    const handleRemoveCollaborator = async (id: string) => {
        if (!confirm('Are you sure you want to remove this collaborator?')) return;
        const { error } = await supabase.from('collaborators').delete().eq('id', id);
        if (error) console.error('Error removing collaborator:', error);
        else fetchCollaborators();
    };

    const handleRevokeInvitation = async (id: string) => {
        if (!confirm('Are you sure you want to revoke this invitation?')) return;
        const { error } = await supabase.from('invitations').delete().eq('id', id);
        if (error) console.error('Error revoking invitation:', error);
        else fetchInvitations();
    };

    const handleUpdateRole = async (collabId: string, newRole: 'viewer' | 'editor' | 'admin') => {
        const { error } = await supabase
            .from('collaborators')
            .update({ role: newRole })
            .eq('id', collabId);

        if (error) console.error('Error updating role:', error);
        else fetchCollaborators();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Shield className="text-[#004aad]" size={20} />
                        Manage Collaborators
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-8">
                    {/* Invite Section */}
                    <section>
                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
                            <Mail size={16} /> Invite New Member
                        </h3>
                        <form onSubmit={handleInvite} className="space-y-4">
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter email address"
                                    className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:border-[#004aad] focus:ring-2 focus:ring-[#004aad]/20 outline-none transition-all"
                                    required
                                />
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as any)}
                                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white focus:border-[#004aad] outline-none cursor-pointer"
                                >
                                    <option value="viewer">Viewer</option>
                                    <option value="editor">Editor</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-[#004aad] text-white font-bold py-2.5 rounded-xl hover:bg-[#003882] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <span>Sending...</span>
                                ) : (
                                    <>
                                        <Mail size={18} /> Send Invitation
                                    </>
                                )}
                            </button>
                            {inviteError && <p className="text-red-500 text-sm font-medium">{inviteError}</p>}
                        </form>
                        {/* Link generation UI removed as it is now handled via email */}
                    </section>

                    {/* Pending Invitations */}
                    {invitations.length > 0 && (
                        <section>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Pending Invitations</h3>
                            <div className="space-y-2">
                                {invitations.map((inv) => (
                                    <div key={inv.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100/50">
                                        <div>
                                            <p className="font-bold text-slate-700 text-sm">{inv.email}</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-medium px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full capitalize">
                                                    {inv.status}
                                                </span>
                                                <span className="text-xs text-slate-400 capitalize">• {inv.role}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(`${window.location.origin}?invite_token=${inv.token}`);
                                                    alert('Link copied!');
                                                }}
                                                className="p-2 text-slate-400 hover:text-[#004aad] hover:bg-white rounded-lg transition-all"
                                                title="Copy Link Again"
                                            >
                                                <Copy size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleRevokeInvitation(inv.id)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                title="Revoke Invitation"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Current Collaborators */}
                    <section>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Team Members</h3>
                        {collaborators.length === 0 ? (
                            <p className="text-sm text-slate-400 italic">No collaborators yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {collaborators.map((collab) => (
                                    <div key={collab.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                                        <div className="flex items-center gap-3">
                                            {collab.profile?.avatar_url ? (
                                                <img src={collab.profile.avatar_url} alt={collab.profile.name || 'User'} className="w-10 h-10 rounded-full object-cover" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-sm">
                                                    {(collab.profile?.name || collab.profile?.email || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm">{collab.profile?.name || 'Unknown User'}</p>
                                                <p className="text-xs text-slate-500">{collab.profile?.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <select
                                                value={collab.role}
                                                onChange={(e) => handleUpdateRole(collab.id, e.target.value as any)}
                                                className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-lg capitalize border border-slate-200 outline-none cursor-pointer hover:bg-slate-200 transition-colors"
                                            >
                                                <option value="viewer">Viewer</option>
                                                <option value="editor">Editor</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                            <button
                                                onClick={() => handleRemoveCollaborator(collab.id)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                title="Remove User"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};

export default CollaboratorModal;
