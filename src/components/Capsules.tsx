/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Clock,
  Lock,
  Unlock,
  Globe,
  EyeOff,
  Trash2,
  ArrowLeft,
  Calendar,
  Tag,
  Hash,
  ExternalLink,
  Flame,
  Loader2,
  Sparkles,
  ChevronDown,
  AlertCircle,
  Rocket,
  Gem,
  Hourglass,
  Zap,
  Frown,
  Send,
} from 'lucide-react';
import { capsulesApi, type Capsule, type CapsuleInput, type CapsuleRevealInput } from '../api/client';
import { WalletConnectButton } from './WalletConnectButton';
import { useCapsuleContract } from '../hooks/useCapsuleContract';

interface CapsulesProps {
  language: 'en' | 'zh';
  showToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

type CapsuleType = Capsule['type'];
type CapsuleStatus = Capsule['status'];

const typeMeta: Record<CapsuleType, { en: string; zh: string; icon: React.ReactNode; color: string; gradient: string; symbol: string }> = {
  commitment: {
    en: 'Commitment',
    zh: '承诺',
    icon: <Flame className="w-4 h-4" />,
    color: 'text-rose-500',
    gradient: 'from-rose-400 to-orange-400',
    symbol: '🔥',
  },
  secret: {
    en: 'Secret',
    zh: '秘密',
    icon: <Lock className="w-4 h-4" />,
    color: 'text-violet-500',
    gradient: 'from-violet-400 to-indigo-400',
    symbol: '🔮',
  },
  milestone: {
    en: 'Milestone',
    zh: '里程碑',
    icon: <Gem className="w-4 h-4" />,
    color: 'text-emerald-500',
    gradient: 'from-emerald-400 to-teal-400',
    symbol: '💎',
  },
};

const statusMeta: Record<CapsuleStatus, { en: string; zh: string; color: string; bg: string; icon: React.ReactNode; label: string }> = {
  sealed: {
    en: 'Sealed',
    zh: '封存中',
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    icon: <Lock className="w-3.5 h-3.5" />,
    label: 'Sealed',
  },
  revealed: {
    en: 'Revealed',
    zh: '已开启',
    color: 'text-emerald-500',
    bg: 'bg-emerald-50',
    icon: <Unlock className="w-3.5 h-3.5" />,
    label: 'Revealed',
  },
  failed: {
    en: 'Failed',
    zh: '未达成',
    color: 'text-slate-500',
    bg: 'bg-slate-100',
    icon: <Frown className="w-3.5 h-3.5" />,
    label: 'Failed',
  },
  extended: {
    en: 'Extended',
    zh: '已延期',
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    icon: <Clock className="w-3.5 h-3.5" />,
    label: 'Extended',
  },
};

function CapsuleIllustration({ type, unlocked }: { type: CapsuleType; unlocked?: boolean }) {
  const gradients = {
    commitment: ['#f43f5e', '#fb923c'],
    secret: ['#8b5cf6', '#6366f1'],
    milestone: ['#10b981', '#14b8a6'],
  };
  const [c1, c2] = gradients[type];
  const fill = unlocked ? 'url(#glow)' : 'url(#body)';
  return (
    <svg viewBox="0 0 120 160" className="w-24 h-24 drop-shadow-xl">
      <defs>
        <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c2} />
          <stop offset="100%" stopColor={c1} />
        </linearGradient>
        <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <ellipse cx="60" cy="145" rx="30" ry="8" fill="rgba(0,0,0,0.15)" filter="url(#blur)" />
      <path d="M35 60 Q35 30 60 25 Q85 30 85 60 L85 110 Q85 130 60 135 Q35 130 35 110 Z" fill={fill} />
      <rect x="35" y="55" width="50" height="12" rx="4" fill="rgba(255,255,255,0.35)" />
      <rect x="42" y="48" width="36" height="10" rx="3" fill="rgba(255,255,255,0.6)" />
      {unlocked && (
        <>
          <circle cx="60" cy="90" r="14" fill="rgba(255,255,255,0.25)" />
          <path d="M54 90 L60 96 L68 84" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export const Capsules: React.FC<CapsulesProps> = ({ language, showToast }) => {
  const {
    isConnected,
    currentChain,
    canSeal,
    contractAddress,
    isPending: isContractPending,
    hash,
    explorerUrl,
    sealCapsule,
  } = useCapsuleContract();

  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | CapsuleType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CapsuleStatus>('all');
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedCapsule, setSelectedCapsule] = useState<Capsule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSealing, setIsSealing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [justCreated, setJustCreated] = useState(false);

  const [form, setForm] = useState({
    title: '',
    content: '',
    type: 'commitment' as CapsuleType,
    unlockAt: getDefaultUnlockAt(),
    isPublic: false,
    isEncrypted: false,
    tags: '',
  });

  const [revealForm, setRevealForm] = useState({
    status: 'revealed' as CapsuleRevealInput['status'],
    reflection: '',
    newUnlockAt: getDefaultUnlockAt(),
  });

  const loadCapsules = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await capsulesApi.list();
      setCapsules(data);
    } catch (err) {
      console.error('Failed to load capsules:', err);
      showToast?.(language === 'zh' ? '加载胶囊失败' : 'Failed to load capsules', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [language, showToast]);

  useEffect(() => { loadCapsules(); }, [loadCapsules]);

  const filteredCapsules = useMemo(() => {
    return capsules.filter(c => {
      const matchesSearch =
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesType = typeFilter === 'all' || c.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [capsules, searchQuery, typeFilter, statusFilter]);

  const counts = useMemo(() => ({
    sealed: capsules.filter(c => c.status === 'sealed').length,
    revealed: capsules.filter(c => c.status === 'revealed').length,
    failed: capsules.filter(c => c.status === 'failed').length,
    extended: capsules.filter(c => c.status === 'extended').length,
    due: capsules.filter(c => c.status === 'sealed' && new Date(c.unlockAt) <= new Date()).length,
  }), [capsules]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    try {
      setIsSubmitting(true);
      const input: CapsuleInput = {
        title: form.title.trim(),
        content: form.content.trim(),
        type: form.type,
        unlockAt: form.unlockAt,
        isPublic: form.isPublic,
        isEncrypted: form.isEncrypted,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      };
      await capsulesApi.create(input);
      showToast?.(language === 'zh' ? '胶囊已封存到未来' : 'Capsule sealed into the future', 'success');
      resetForm();
      setJustCreated(true);
      setTimeout(() => setJustCreated(false), 2500);
      setViewMode('list');
      await loadCapsules();
    } catch (err) {
      console.error('Failed to create capsule:', err);
      showToast?.(language === 'zh' ? '封存失败' : 'Failed to seal capsule', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReveal = async () => {
    if (!selectedCapsule) return;
    try {
      setIsSubmitting(true);
      const input: CapsuleRevealInput = {
        status: revealForm.status,
        reflection: revealForm.reflection.trim(),
        newUnlockAt: revealForm.status === 'extended' ? revealForm.newUnlockAt : undefined,
      };
      await capsulesApi.reveal(selectedCapsule.id, input);
      const msg = revealForm.status === 'revealed'
        ? (language === 'zh' ? '胶囊已开启，恭喜达成！' : 'Capsule opened, congrats!')
        : revealForm.status === 'failed'
        ? (language === 'zh' ? '已记录，下一次会更好' : 'Recorded, better next time')
        : (language === 'zh' ? '胶囊已延期' : 'Capsule extended');
      showToast?.(msg, 'success');
      setViewMode('list');
      setSelectedCapsule(null);
      await loadCapsules();
    } catch (err) {
      console.error('Failed to reveal capsule:', err);
      showToast?.(language === 'zh' ? '开启失败' : 'Failed to reveal capsule', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(language === 'zh' ? '确定把这个胶囊丢进时空裂缝吗？' : 'Throw this capsule into the void?')) return;
    try {
      setIsDeleting(true);
      await capsulesApi.delete(id);
      showToast?.(language === 'zh' ? '胶囊已消失在时间长河' : 'Capsule vanished into time', 'info');
      setViewMode('list');
      setSelectedCapsule(null);
      await loadCapsules();
    } catch (err) {
      console.error('Failed to delete capsule:', err);
      showToast?.(language === 'zh' ? '删除失败' : 'Failed to delete capsule', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSeal = async (provider: 'arweave' | 'evm') => {
    if (!selectedCapsule) return;
    if (provider === 'evm' && !canSeal) {
      showToast?.(
        language === 'zh' ? '请先连接钱包并切换到已部署合约的链' : 'Please connect wallet and switch to a chain with deployed contract',
        'error'
      );
      return;
    }
    try {
      setIsSealing(true);
      if (provider === 'evm') {
        if (!currentChain?.id) throw new Error('No chain selected');
        const input: CapsuleInput = {
          title: selectedCapsule.title,
          content: selectedCapsule.content,
          type: selectedCapsule.type,
          unlockAt: selectedCapsule.unlockAt,
          isPublic: selectedCapsule.isPublic,
          isEncrypted: selectedCapsule.isEncrypted,
          tags: selectedCapsule.tags,
        };
        await sealCapsule(selectedCapsule, input);
        showToast?.(language === 'zh' ? '交易已提交，等待确认' : 'Transaction submitted, awaiting confirmation', 'info');
      } else {
        const updated = await capsulesApi.seal(selectedCapsule.id, provider);
        setSelectedCapsule(updated);
        showToast?.(
          language === 'zh' ? '已写入 Arweave 永恒档案（模拟）' : 'Sealed to Arweave (mock)',
          'success'
        );
        await loadCapsules();
      }
    } catch (err: any) {
      console.error('Failed to seal capsule:', err);
      showToast?.(err?.message || (language === 'zh' ? '上链失败' : 'Failed to seal on chain'), 'error');
      setIsSealing(false);
    }
  };

  useEffect(() => {
    if (!hash || !selectedCapsule || !currentChain?.id || !contractAddress) return;
    let cancelled = false;
    const persist = async () => {
      try {
        const updated = await capsulesApi.seal(selectedCapsule.id, 'evm');
        if (cancelled) return;
        const onChainId = selectedCapsule.proof?.onChainId;
        const proof = {
          ...updated.proof,
          provider: 'evm' as const,
          txId: hash,
          chainId: currentChain.id,
          contractAddress,
          onChainId,
        };
        setSelectedCapsule({ ...updated, proof });
        showToast?.(language === 'zh' ? '胶囊已上链，未来无法篡改' : 'Capsule sealed on chain, tamper-proof forever', 'success');
        await loadCapsules();
      } catch (err) {
        console.error('Failed to persist EVM seal:', err);
        showToast?.(language === 'zh' ? '链上记录已提交，但本地保存失败' : 'On-chain tx submitted, but local persistence failed', 'error');
      } finally {
        if (!cancelled) setIsSealing(false);
      }
    };
    persist();
    return () => { cancelled = true; };
  }, [hash, selectedCapsule, currentChain, contractAddress, language, showToast, loadCapsules]);

  const resetForm = () => {
    setForm({
      title: '',
      content: '',
      type: 'commitment',
      unlockAt: getDefaultUnlockAt(),
      isPublic: false,
      isEncrypted: false,
      tags: '',
    });
  };

  const openDetail = (capsule: Capsule) => {
    setSelectedCapsule(capsule);
    setRevealForm({
      status: 'revealed',
      reflection: '',
      newUnlockAt: getDefaultUnlockAt(),
    });
    setViewMode('detail');
  };

  const isUnlocked = (capsule: Capsule) => capsule.status === 'sealed' && new Date(capsule.unlockAt) <= new Date();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/60" />
        <div className="absolute top-[8%] left-[12%] w-1.5 h-1.5 bg-indigo-300 rounded-full animate-pulse opacity-70" />
        <div className="absolute top-[18%] left-[22%] w-1 h-1 bg-amber-300 rounded-full animate-pulse opacity-70" style={{ animationDelay: '0.5s' }} />
        <div className="absolute top-[14%] right-[18%] w-1 h-1 bg-rose-300 rounded-full animate-pulse opacity-70" style={{ animationDelay: '1.2s' }} />
        <div className="absolute top-[28%] right-[28%] w-1 h-1 bg-emerald-300 rounded-full animate-pulse opacity-70" style={{ animationDelay: '0.8s' }} />
        <div className="absolute bottom-[18%] left-[10%] w-2 h-2 bg-violet-300/40 rounded-full animate-pulse opacity-70" style={{ animationDelay: '1.5s' }} />
      </div>

      <div className="relative flex items-center justify-between px-6 py-5 border-b border-indigo-100/50 bg-white/60 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
            <Hourglass className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              {language === 'zh' ? '时间胶囊' : 'Time Capsules'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {language === 'zh'
                ? '把承诺、秘密和里程碑封存在时光里，未来开启'
                : 'Seal commitments, secrets, and milestones in time'}
            </p>
          </div>
        </div>
        <button
          onClick={() => { resetForm(); setViewMode('create'); }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-xl shadow-lg shadow-indigo-200 hover:shadow-indigo-300 hover:scale-105 transition-all active:scale-95"
        >
          <Rocket className="w-4 h-4" />
          {language === 'zh' ? '发射胶囊' : 'Launch Capsule'}
        </button>
        <WalletConnectButton language={language} />
      </div>

      <AnimatePresence mode="wait">
        {viewMode === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex-1 flex flex-col relative"
          >
            <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatPill
                label={language === 'zh' ? '封存中' : 'Sealed'}
                value={counts.sealed}
                icon={<Lock className="w-4 h-4" />}
                gradient="from-amber-400 to-orange-400"
              />
              <StatPill
                label={language === 'zh' ? '已开启' : 'Revealed'}
                value={counts.revealed}
                icon={<Sparkles className="w-4 h-4" />}
                gradient="from-emerald-400 to-teal-400"
              />
              <StatPill
                label={language === 'zh' ? '未达成' : 'Failed'}
                value={counts.failed}
                icon={<Frown className="w-4 h-4" />}
                gradient="from-slate-400 to-slate-500"
              />
              <StatPill
                label={language === 'zh' ? '待开启' : 'Due'}
                value={counts.due}
                icon={<Zap className="w-4 h-4" />}
                gradient="from-violet-400 to-indigo-500"
              />
            </div>

            <div className="px-6 py-2 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={language === 'zh' ? '搜索胶囊...' : 'Search capsules...'}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white/70 border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all shadow-sm"
                />
              </div>
              <FilterSelect
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  { value: 'all', label: language === 'zh' ? '全部类型' : 'All types' },
                  { value: 'commitment', label: '🔥 ' + (language === 'zh' ? '承诺' : 'Commitment') },
                  { value: 'secret', label: '🔮 ' + (language === 'zh' ? '秘密' : 'Secret') },
                  { value: 'milestone', label: '💎 ' + (language === 'zh' ? '里程碑' : 'Milestone') },
                ]}
              />
              <FilterSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: language === 'zh' ? '全部状态' : 'All statuses' },
                  { value: 'sealed', label: language === 'zh' ? '封存中' : 'Sealed' },
                  { value: 'revealed', label: language === 'zh' ? '已开启' : 'Revealed' },
                  { value: 'failed', label: language === 'zh' ? '未达成' : 'Failed' },
                  { value: 'extended', label: language === 'zh' ? '已延期' : 'Extended' },
                ]}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {filteredCapsules.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center h-72 text-slate-500"
                >
                  <div className="relative mb-5">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                      <Rocket className="w-10 h-10 text-indigo-400" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-300 flex items-center justify-center text-[10px]">✨</div>
                  </div>
                  <p className="text-sm font-medium">{language === 'zh' ? '时空还很空旷' : 'The timeline is empty'}</p>
                  <p className="text-xs text-slate-400 mt-1">{language === 'zh' ? '封存你的第一个胶囊，让它飞向未来' : 'Seal your first capsule and send it to the future'}</p>
                  <button
                    onClick={() => { resetForm(); setViewMode('create'); }}
                    className="mt-4 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
                  >
                    {language === 'zh' ? '发射第一个胶囊' : 'Launch first capsule'}
                  </button>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                >
                  {filteredCapsules.map((capsule, idx) => (
                    <CapsuleCard
                      key={capsule.id}
                      capsule={capsule}
                      language={language}
                      onClick={() => openDetail(capsule)}
                      isUnlocked={isUnlocked(capsule)}
                      index={idx}
                    />
                  ))}
                </div>
              )}
            </div>

            <AnimatePresence>
              {justCreated && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.9 }}
                  className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-full shadow-xl flex items-center gap-2"
                >
                  <Rocket className="w-4 h-4" />
                  {language === 'zh' ? '胶囊已发射到未来！' : 'Capsule launched into the future!'}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {viewMode === 'create' && (
          <motion.div
            key="create"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="flex-1 overflow-y-auto p-6 relative"
          >
            <div className="max-w-2xl mx-auto bg-white/80 backdrop-blur-xl border border-indigo-100 rounded-3xl p-7 shadow-xl shadow-indigo-100">
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => setViewMode('list')}
                  className="p-2 text-slate-500 hover:text-slate-800 hover:bg-indigo-50 rounded-xl transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center">
                    <Send className="w-4 h-4" />
                  </div>
                  <h2 className="text-base font-bold text-slate-800">
                    {language === 'zh' ? '封存新胶囊' : 'Seal a new capsule'}
                  </h2>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 p-1 bg-indigo-50/60 rounded-2xl">
                  {(['commitment', 'secret', 'milestone'] as CapsuleType[]).map(t => {
                    const meta = typeMeta[t];
                    const active = form.type === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setForm({ ...form, type: t })}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-xl transition-all ${
                          active
                            ? `bg-gradient-to-r ${meta.gradient} text-white shadow-md`
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        <span className="text-sm">{meta.symbol}</span>
                        {meta[language]}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      {language === 'zh' ? '标题' : 'Title'}
                    </label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                      placeholder={language === 'zh' ? '例如：100 天健身挑战' : 'e.g. 100-day fitness challenge'}
                      className="w-full px-4 py-2.5 text-sm bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      {language === 'zh' ? '开启时间' : 'Unlock at'}
                    </label>
                    <input
                      type="datetime-local"
                      value={form.unlockAt}
                      onChange={e => setForm({ ...form, unlockAt: e.target.value })}
                      className="w-full px-4 py-2.5 text-sm bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                      <Tag className="w-3 h-3 inline mr-1" />
                      {language === 'zh' ? '标签' : 'Tags'}
                    </label>
                    <input
                      type="text"
                      value={form.tags}
                      onChange={e => setForm({ ...form, tags: e.target.value })}
                      placeholder={language === 'zh' ? '健身, 习惯' : 'fitness, habit'}
                      className="w-full px-4 py-2.5 text-sm bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    {language === 'zh' ? '内容' : 'Content'}
                  </label>
                  <textarea
                    value={form.content}
                    onChange={e => setForm({ ...form, content: e.target.value })}
                    rows={5}
                    placeholder={
                      form.type === 'commitment'
                        ? (language === 'zh' ? '我承诺在……时间前完成……\n验收标准是……' : 'I commit to... by...\nSuccess criteria:')
                        : form.type === 'secret'
                        ? (language === 'zh' ? '给未来的自己写一段话...' : 'Write a message to your future self...')
                        : (language === 'zh' ? '这个里程碑达成时，我希望...' : 'When this milestone is reached, I want...')
                    }
                    className="w-full px-4 py-3 text-sm bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all shadow-sm resize-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer px-3 py-2 rounded-xl bg-indigo-50/50 hover:bg-indigo-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={form.isPublic}
                      onChange={e => setForm({ ...form, isPublic: e.target.checked })}
                      className="rounded border-indigo-200 text-indigo-500 focus:ring-indigo-200"
                    />
                    <Globe className="w-3.5 h-3.5 text-indigo-400" />
                    {language === 'zh' ? '公开' : 'Public'}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer px-3 py-2 rounded-xl bg-indigo-50/50 hover:bg-indigo-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={form.isEncrypted}
                      onChange={e => setForm({ ...form, isEncrypted: e.target.checked })}
                      className="rounded border-indigo-200 text-indigo-500 focus:ring-indigo-200"
                    />
                    <EyeOff className="w-3.5 h-3.5 text-indigo-400" />
                    {language === 'zh' ? '加密' : 'Encrypted'}
                  </label>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3"
                >
                  <button
                    onClick={() => setViewMode('list')}
                    className="px-5 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-800 rounded-xl hover:bg-indigo-50 transition-colors"
                  >
                    {language === 'zh' ? '取消' : 'Cancel'}
                  </button>
                  <motion.button
                    onClick={handleCreate}
                    disabled={isSubmitting || !form.title.trim() || !form.content.trim()}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-1.5 px-6 py-2.5 text-sm font-semibold bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-xl shadow-lg shadow-indigo-200 hover:shadow-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {language === 'zh' ? '发射胶囊' : 'Launch Capsule'}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {viewMode === 'detail' && selectedCapsule && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="flex-1 overflow-y-auto p-6 relative"
          >
            <div className="max-w-2xl mx-auto bg-white/80 backdrop-blur-xl border border-indigo-100 rounded-3xl p-7 shadow-xl shadow-indigo-100"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setViewMode('list')}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-indigo-50 rounded-xl transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center"
                  >
                    <CapsuleIllustration type={selectedCapsule.type} unlocked={isUnlocked(selectedCapsule)} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">{selectedCapsule.title}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <TypeBadge type={selectedCapsule.type} language={language} />
                      <StatusBadge status={selectedCapsule.status} language={language} />
                      {isUnlocked(selectedCapsule) && (
                        <span className="text-[10px] px-2 py-0.5 bg-violet-100 text-violet-600 rounded-full font-semibold"
                        >
                          ✨ {language === 'zh' ? '可以开启' : 'Ready'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(selectedCapsule.id)}
                  disabled={isDeleting}
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors disabled:opacity-50"
                  title={language === 'zh' ? '删除' : 'Delete'}
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>

              <div className="space-y-5"
              >
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500"
                >
                  <span className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 rounded-lg"
                  >
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    {language === 'zh' ? '封存' : 'Sealed'}: {formatDateTime(selectedCapsule.createdAt, language)}
                  </span>
                  <span className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 rounded-lg"
                  >
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    {language === 'zh' ? '开启' : 'Unlock'}: {formatDateTime(selectedCapsule.unlockAt, language)}
                  </span>
                </div>

                {selectedCapsule.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2"
                  >
                    {selectedCapsule.tags.map(tag => (
                      <span key={tag} className="text-[11px] px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full font-medium"
                      >
                        <Hash className="w-3 h-3 inline mr-0.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="bg-gradient-to-br from-indigo-50/70 to-violet-50/50 rounded-2xl p-5 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed border border-indigo-100/60"
                >
                  {selectedCapsule.content}
                </div>

                {selectedCapsule.proof?.provider !== 'local' && selectedCapsule.proof?.gatewayUrl && (
                  <div className="flex items-center gap-3 text-xs text-slate-500 p-3 bg-emerald-50 rounded-xl border border-emerald-100"
                  >
                    <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-600 font-semibold"
                    >
                      {selectedCapsule.proof.provider === 'arweave' ? '🌍 Arweave' : '⛓ EVM'}
                    </span>
                    <a
                      href={selectedCapsule.proof.gatewayUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-emerald-600 hover:underline font-medium"
                    >
                      {selectedCapsule.proof.txId?.slice(0, 12)}...
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {selectedCapsule.status !== 'sealed' && selectedCapsule.reflection && (
                  <div className="border-l-4 border-indigo-300 pl-4 py-2"
                  >
                    <h3 className="text-xs font-bold text-slate-500 mb-1"
                    >
                      {language === 'zh' ? '复盘' : 'Reflection'}
                    </h3>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed"
                    >{selectedCapsule.reflection}</p>
                  </div>
                )}

                {selectedCapsule.status === 'sealed' && isUnlocked(selectedCapsule) && (
                  <div className="border-t border-indigo-100 pt-5"
                  >
                    <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"
                    >
                      <Unlock className="w-4 h-4 text-violet-500" />
                      {language === 'zh' ? '开启胶囊' : 'Open capsule'}
                    </h3>
                    <div className="space-y-3"
                    >
                      <div className="flex items-center gap-3"
                      >
                        <select
                          value={revealForm.status}
                          onChange={e => setRevealForm({ ...revealForm, status: e.target.value as CapsuleRevealInput['status'] })}
                          className="px-4 py-2 text-sm bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 shadow-sm"
                        >
                          <option value="revealed">✅ {language === 'zh' ? '已完成 / 达成' : 'Completed / Revealed'}</option>
                          <option value="failed">🌧 {language === 'zh' ? '未达成' : 'Failed'}</option>
                          <option value="extended">⏳ {language === 'zh' ? '延期' : 'Extended'}</option>
                        </select>
                        {revealForm.status === 'extended' && (
                          <input
                            type="datetime-local"
                            value={revealForm.newUnlockAt}
                            onChange={e => setRevealForm({ ...revealForm, newUnlockAt: e.target.value })}
                            className="px-4 py-2 text-sm bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 shadow-sm"
                          />
                        )}
                      </div>
                      <textarea
                        value={revealForm.reflection}
                        onChange={e => setRevealForm({ ...revealForm, reflection: e.target.value })}
                        rows={3}
                        placeholder={language === 'zh' ? '写下复盘或给未来的话...' : 'Write a reflection or message to the future...'}
                        className="w-full px-4 py-3 text-sm bg-white border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none shadow-sm"
                      />
                      <div className="flex items-center gap-2"
                      >
                        <button
                          onClick={handleReveal}
                          disabled={isSubmitting}
                          className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-violet-500 to-indigo-500 text-white rounded-xl shadow-lg shadow-violet-200 hover:shadow-violet-300 disabled:opacity-50 transition-all active:scale-95"
                        >
                          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                          {language === 'zh' ? '开启' : 'Open'}
                        </button>
                        {selectedCapsule.proof?.provider === 'local' && (
                          <>
                            <button
                              onClick={() => handleSeal('arweave')}
                              disabled={isSealing}
                              className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-xl hover:bg-emerald-100 disabled:opacity-50 transition-colors border border-emerald-100"
                            >
                              {isSealing ? <Loader2 className="w-3 h-3 animate-spin" /> : '🌍 Arweave'}
                            </button>
                            <button
                              onClick={() => handleSeal('evm')}
                              disabled={isSealing || !canSeal}
                              className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition-colors border border-blue-100"
                            >
                              {isSealing ? <Loader2 className="w-3 h-3 animate-spin" /> : '⛓ EVM'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {selectedCapsule.status === 'sealed' && !isUnlocked(selectedCapsule) && (
                  <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-xl px-4 py-3 border border-amber-100"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {language === 'zh' ? '时间还没到，耐心是胶囊魔法的一部分 ✨' : 'Not yet. Patience is part of the magic ✨'}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function CapsuleCard({
  capsule,
  language,
  onClick,
  isUnlocked,
  index,
  key,
}: {
  capsule: Capsule;
  language: 'en' | 'zh';
  onClick: () => void;
  isUnlocked: boolean;
  index: number;
  key: string;
}) {
  const meta = typeMeta[capsule.type];
  const status = statusMeta[capsule.status];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className={`group relative p-5 bg-white/80 backdrop-blur-sm border rounded-2xl cursor-pointer transition-shadow hover:shadow-xl hover:shadow-indigo-100 ${
        isUnlocked ? 'border-violet-300 ring-1 ring-violet-200' : 'border-indigo-100'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${meta.gradient} text-white flex items-center justify-center shadow-md`}>
          {meta.icon}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${status.bg} ${status.color}`}>
            {status[language]}
          </span>
          {isUnlocked && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-violet-100 text-violet-600">
              ✨ {language === 'zh' ? '待开启' : 'Due'}
            </span>
          )}
        </div>
      </div>

      <h3 className="text-sm font-bold text-slate-800 mb-1 line-clamp-2">{capsule.title}</h3>
      <p className="text-xs text-slate-500 line-clamp-2 mb-3 whitespace-pre-wrap leading-relaxed">{capsule.content}</p>

      <div className="flex items-center justify-between text-[11px] text-slate-400"
      >
        <span className="flex items-center gap-1"
        >
          <Clock className="w-3 h-3" />
          {formatDateTime(capsule.unlockAt, language)}
        </span>
        {capsule.proof?.provider !== 'local' && (
          <span className="text-emerald-500 font-medium"
          >
            {capsule.proof.provider === 'arweave' ? '🌍' : '⛓'}
          </span>
        )}
      </div>

      {capsule.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3"
        >
          {capsule.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function StatPill({
  label,
  value,
  icon,
  gradient,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  gradient: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 bg-white/70 border border-indigo-100 rounded-2xl shadow-sm"
    >
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-sm`}
      >
        {icon}
      </div>
      <div>
        <div className="text-lg font-bold text-slate-800 leading-none">{value}</div>
        <div className="text-[10px] text-slate-500 mt-0.5 font-medium">{label}</div>
      </div>
    </div>
  );
}

function TypeBadge({ type, language }: { type: CapsuleType; language: 'en' | 'zh' }) {
  const meta = typeMeta[type];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-semibold bg-gradient-to-r ${meta.gradient} text-white`}
    >
      {meta.icon}
      {meta[language]}
    </span>
  );
}

function StatusBadge({ status, language }: { status: CapsuleStatus; language: 'en' | 'zh' }) {
  const s = statusMeta[status];
  return <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${s.bg} ${s.color}`}
  >{s[language]}</span>;
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: any) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 text-xs font-medium bg-white/70 border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 shadow-sm"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
    </div>
  );
}

function getDefaultUnlockAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setMinutes(0, 0, 0);
  return toDatetimeLocal(d);
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(iso: string, language: 'en' | 'zh'): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day} ${h}:${min}`;
}

export default Capsules;
