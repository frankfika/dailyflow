import { useEffect, useRef, useState } from 'react';
import { configApi } from '../api/client';

export interface TeamConfig {
  role: 'leader' | 'member';
  memberId: string;
  members: { id: string; name: string; path: string }[];
}

interface TeamSettingsProps {
  language: 'en' | 'zh';
  showSettings: boolean;
  configTab: string;
  onChange: (enabled: boolean, config: TeamConfig | null) => void;
}

export function TeamSettings({ language, showSettings, configTab, onChange }: TeamSettingsProps) {
  const isZh = language === 'zh';
  const [teamEnabled, setTeamEnabled] = useState(false);
  const [teamRole, setTeamRole] = useState<'leader' | 'member'>('member');
  const [teamMemberId, setTeamMemberId] = useState('');
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; path: string }[]>([]);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!showSettings || configTab !== 'team') return;
    configApi.get().then((config) => {
      const team = config.team;
      const enabled = Boolean(team);
      const next: TeamConfig = {
        role: team?.role || 'member',
        memberId: team?.memberId || '',
        members: team?.members || [],
      };
      setTeamEnabled(enabled);
      setTeamRole(next.role);
      setTeamMemberId(next.memberId);
      setTeamMembers(next.members);
      onChangeRef.current(enabled, enabled ? next : null);
    }).catch(() => {
      setTeamEnabled(false);
      setTeamMembers([]);
      onChangeRef.current(false, null);
    });
  }, [showSettings, configTab]);

  const emit = (enabled: boolean, role: 'leader' | 'member', memberId: string, members: { id: string; name: string; path: string }[]) => {
    onChange(enabled, enabled ? { role, memberId, members } : null);
  };

  const setEnabled = (enabled: boolean) => {
    setTeamEnabled(enabled);
    emit(enabled, teamRole, teamMemberId, teamMembers);
  };

  const setRole = (role: 'leader' | 'member') => {
    setTeamRole(role);
    emit(teamEnabled, role, teamMemberId, teamMembers);
  };

  const setMemberId = (memberId: string) => {
    setTeamMemberId(memberId);
    emit(teamEnabled, teamRole, memberId, teamMembers);
  };

  const addTeamMember = () => {
    const next = [...teamMembers, { id: `member_${Date.now()}`, name: '', path: '' }];
    setTeamMembers(next);
    emit(teamEnabled, teamRole, teamMemberId, next);
  };

  const updateTeamMember = (index: number, patch: Partial<{ name: string; path: string }>) => {
    const next = teamMembers.map((m, i) => i === index ? { ...m, ...patch } : m);
    setTeamMembers(next);
    emit(teamEnabled, teamRole, teamMemberId, next);
  };

  const removeTeamMember = (index: number) => {
    const next = teamMembers.filter((_, i) => i !== index);
    setTeamMembers(next);
    emit(teamEnabled, teamRole, teamMemberId, next);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div>
          <h3 className="text-sm font-medium text-text-heading">{isZh ? '启用团队协作' : 'Enable team collaboration'}</h3>
          <p className="text-xs text-text-muted mt-1">{isZh ? '共享一个 git 仓库，leader 只读查看成员任务。' : 'Share a git repo; leader gets read-only view of member tasks.'}</p>
        </div>
        <button
          onClick={() => setEnabled(!teamEnabled)}
          className={`relative h-5 w-9 rounded-full transition-colors ${teamEnabled ? 'bg-accent' : 'bg-stone-300'}`}
          aria-checked={teamEnabled}
          role="switch"
        >
          <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${teamEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      {teamEnabled && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">{isZh ? '我的角色' : 'My role'}</label>
              <select
                value={teamRole}
                onChange={(e) => setRole(e.target.value as 'leader' | 'member')}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="member">{isZh ? '成员' : 'Member'}</option>
                <option value="leader">{isZh ? 'Leader' : 'Leader'}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">{isZh ? '我的成员 ID' : 'My member ID'}</label>
              <input
                type="text"
                value={teamMemberId}
                onChange={(e) => setMemberId(e.target.value)}
                placeholder={isZh ? '例如：alice' : 'e.g. alice'}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-text-heading">{isZh ? '成员列表' : 'Members'}</h3>
              <button
                onClick={addTeamMember}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
              >
                {isZh ? '添加成员' : 'Add member'}
              </button>
            </div>
            {teamMembers.length === 0 ? (
              <p className="text-xs text-text-muted">{isZh ? '还没有配置成员。' : 'No members configured yet.'}</p>
            ) : (
              <ul className="space-y-2">
                {teamMembers.map((member, idx) => (
                  <li key={member.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                    <input
                      type="text"
                      value={member.name}
                      onChange={(e) => updateTeamMember(idx, { name: e.target.value })}
                      placeholder={isZh ? '姓名' : 'Name'}
                      className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm"
                    />
                    <input
                      type="text"
                      value={member.path}
                      onChange={(e) => updateTeamMember(idx, { path: e.target.value })}
                      placeholder={isZh ? '子目录' : 'Subdirectory'}
                      className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => removeTeamMember(idx)}
                      className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-black/5"
                    >
                      {isZh ? '删除' : 'Remove'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg bg-black/[0.03] p-3 text-xs text-text-muted">
            {isZh
              ? '提示：成员的工作区路径为当前 workspaceRoot 下的 members/<memberId>/ 子目录。'
              : 'Tip: each member workspace lives under members/<memberId>/ below the current workspaceRoot.'}
          </div>
        </>
      )}
    </div>
  );
}
