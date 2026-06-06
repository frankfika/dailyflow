/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Loader2, Sparkles, ChevronRight, Save, Copy, Check } from 'lucide-react';
import { PRESET_WORKFLOWS, type Workflow, type WorkflowInputSource } from '../types/workflows';
import { aiApi } from '../api/client';
import { getTodayStr, getWeekRange } from '../utils/tagColors';

interface AIWorkflowProps {
  language: 'en' | 'zh';
  aiApiKey: string;
  aiModel: string;
  aiBaseUrl?: string;
  tasks: any[];
  notes: any[];
  currentFileDate: string;
  filesMap: Record<string, string>;
  onSaveToNotes?: (content: string) => void;
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export function AIWorkflow({
  language,
  aiApiKey,
  aiModel,
  aiBaseUrl,
  tasks,
  notes,
  currentFileDate,
  filesMap,
  onSaveToNotes,
  showToast,
}: AIWorkflowProps) {
  const [workflows] = useState<Workflow[]>(PRESET_WORKFLOWS);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [inputPreview, setInputPreview] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (selectedWorkflow) {
      prepareInput(selectedWorkflow);
    }
  }, [selectedWorkflow, tasks, notes]);

  const prepareInput = (workflow: Workflow) => {
    const inputStep = workflow.steps.find(s => s.type === 'input');
    if (!inputStep) return;

    const source = inputStep.config.source;
    let content = '';

    switch (source) {
      case 'today-tasks':
        const todayTasks = tasks.filter(t => !t.completed);
        content = todayTasks.length > 0
          ? todayTasks.map(t => `- ${t.text}${t.tags?.length ? ` [${t.tags.join(', ')}]` : ''}`).join('\n')
          : (language === 'zh' ? '今日暂无任务' : 'No tasks today');
        break;

      case 'week-tasks':
        const { start, end } = getWeekRange(new Date());
        const weekDates = Object.keys(filesMap).filter(date => date >= start && date <= end);
        const weekTasks: string[] = [];
        weekDates.forEach(date => {
          const content = filesMap[date];
          if (content) {
            const lines = content.split('\n').filter(l => l.trim().startsWith('- ['));
            weekTasks.push(`\n## ${date}\n${lines.join('\n')}`);
          }
        });
        content = weekTasks.length > 0 ? weekTasks.join('\n') : (language === 'zh' ? '本周暂无任务' : 'No tasks this week');
        break;

      case 'notes':
        content = notes.length > 0
          ? notes.map(n => `## ${n.title}\n${n.content}`).join('\n\n')
          : (language === 'zh' ? '暂无笔记' : 'No notes');
        break;

      case 'custom':
        content = customInput || (language === 'zh' ? '请输入内容...' : 'Enter content...');
        break;
    }

    setInputPreview(content);
  };

  const handleRunWorkflow = async () => {
    if (!selectedWorkflow) return;
    if (!aiApiKey) {
      setError(language === 'zh' ? '请先配置 AI API Key' : 'Please configure AI API Key first');
      return;
    }

    const inputStep = selectedWorkflow.steps.find(s => s.type === 'input');
    const aiStep = selectedWorkflow.steps.find(s => s.type === 'ai-process');

    if (!inputStep || !aiStep || !inputPreview.trim()) {
      setError(language === 'zh' ? '工作流配置错误' : 'Workflow configuration error');
      return;
    }

    setIsRunning(true);
    setError('');
    setOutput('');

    try {
      const { summary } = await aiApi.summarize({
        apiKey: aiApiKey,
        model: aiModel,
        baseUrl: aiBaseUrl || '',
        systemPrompt: language === 'zh'
          ? '你是一位专业的工作助手，请按照用户要求处理内容。'
          : 'You are a professional work assistant. Process content according to user requirements.',
        userPrompt: `${aiStep.config.promptText}\n\n---\n\n${inputPreview}`,
      });

      setOutput(summary);
      showToast(language === 'zh' ? '工作流执行成功' : 'Workflow executed successfully', 'success');
    } catch (err: any) {
      setError(err.message || String(err));
      showToast(language === 'zh' ? '执行失败' : 'Execution failed', 'error');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSaveOutput = () => {
    if (!output) return;
    onSaveToNotes?.(output);
    showToast(language === 'zh' ? '已保存到笔记' : 'Saved to notes', 'success');
  };

  const handleCopyOutput = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast(language === 'zh' ? '已复制' : 'Copied', 'success');
  };

  const categories = [
    { value: 'all', label: language === 'zh' ? '全部' : 'All' },
    { value: 'report', label: language === 'zh' ? '报告' : 'Report' },
    { value: 'analysis', label: language === 'zh' ? '分析' : 'Analysis' },
    { value: 'automation', label: language === 'zh' ? '自动化' : 'Automation' },
  ];

  return (
    <div className="h-full flex bg-surface">
      {/* Left: Workflow list */}
      <div className="w-80 border-r border-border flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-sans font-semibold text-text-heading">
              {language === 'zh' ? 'AI 工作流' : 'AI Workflows'}
            </h2>
          </div>
          <p className="text-xs text-text-muted">
            {language === 'zh' ? '自动化处理任务和笔记' : 'Automate tasks and notes processing'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {workflows.map(workflow => (
            <motion.div
              key={workflow.id}
              onClick={() => { setSelectedWorkflow(workflow); setOutput(''); setError(''); }}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedWorkflow?.id === workflow.id
                  ? 'bg-accent/10 border-accent/30'
                  : 'bg-surface-white border-border hover:border-accent/20'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{workflow.icon}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-text-heading mb-0.5">
                    {language === 'zh' ? workflow.name : workflow.nameEn}
                  </h3>
                  <p className="text-xs text-text-muted line-clamp-2">
                    {language === 'zh' ? workflow.description : workflow.descriptionEn}
                  </p>
                </div>
                {selectedWorkflow?.id === workflow.id && (
                  <ChevronRight className="w-4 h-4 text-accent flex-shrink-0" />
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right: Workflow detail and execution */}
      <div className="flex-1 flex flex-col">
        {selectedWorkflow ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-3xl">{selectedWorkflow.icon}</span>
                    <h2 className="text-xl font-sans font-semibold text-text-heading">
                      {language === 'zh' ? selectedWorkflow.name : selectedWorkflow.nameEn}
                    </h2>
                  </div>
                  <p className="text-sm text-text-muted">
                    {language === 'zh' ? selectedWorkflow.description : selectedWorkflow.descriptionEn}
                  </p>
                </div>
                <button
                  onClick={handleRunWorkflow}
                  disabled={isRunning || !inputPreview.trim() || (selectedWorkflow.steps[0].config.source === 'custom' && !customInput.trim())}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {language === 'zh' ? '运行' : 'Run'}
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Custom input if needed */}
              {selectedWorkflow.steps[0].config.source === 'custom' && (
                <div>
                  <label className="block text-xs font-bold text-text-muted mb-2">
                    {language === 'zh' ? '输入内容' : 'Input Content'}
                  </label>
                  <textarea
                    value={customInput}
                    onChange={e => { setCustomInput(e.target.value); prepareInput(selectedWorkflow); }}
                    placeholder={language === 'zh' ? '输入要处理的内容...' : 'Enter content to process...'}
                    rows={6}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface focus:outline-none focus:border-accent resize-none font-mono"
                  />
                </div>
              )}

              {/* Input preview */}
              <div>
                <label className="block text-xs font-bold text-text-muted mb-2">
                  {language === 'zh' ? '输入预览' : 'Input Preview'}
                </label>
                <div className="p-4 bg-surface-white border border-border rounded-lg">
                  <pre className="text-xs font-mono whitespace-pre-wrap text-text-muted max-h-[200px] overflow-y-auto">
                    {inputPreview || (language === 'zh' ? '暂无内容' : 'No content')}
                  </pre>
                </div>
              </div>

              {/* Output */}
              {(output || error) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-text-muted">
                      {language === 'zh' ? '输出结果' : 'Output'}
                    </label>
                    {output && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopyOutput}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-text-muted hover:text-accent transition-colors"
                        >
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {language === 'zh' ? '复制' : 'Copy'}
                        </button>
                        {onSaveToNotes && (
                          <button
                            onClick={handleSaveOutput}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-bold bg-accent/10 text-accent rounded hover:bg-accent/20 transition-colors"
                          >
                            <Save className="w-3 h-3" />
                            {language === 'zh' ? '保存到笔记' : 'Save to Notes'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="p-4 bg-surface-white border border-border rounded-lg">
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    {output && (
                      <pre className="text-sm font-mono whitespace-pre-wrap text-text-heading">
                        {output}
                      </pre>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted">
            <div className="text-center">
              <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm">{language === 'zh' ? '选择一个工作流开始' : 'Select a workflow to start'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
