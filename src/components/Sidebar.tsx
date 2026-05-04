import { motion } from 'motion/react';
import { Calendar, FolderOpen, LayoutDashboard, ChevronLeft, ChevronRight } from 'lucide-react';

interface SidebarProps {
  files: string[];
  currentDate: string;
  onSelectDate: (date: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ files, currentDate, onSelectDate, isOpen, onToggle }: SidebarProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === currentDate) return 'Today';
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          width: isOpen ? 280 : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={{ duration: 0.2 }}
        className="fixed lg:relative h-full bg-background border-r border-border z-50 overflow-hidden"
      >
        <div className="w-[280px] h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-accent" />
              <span className="font-semibold">Daily Notes</span>
            </div>
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg hover:bg-accent/10 lg:hidden"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* File List */}
          <div className="flex-1 overflow-y-auto p-2">
            {files.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No notes yet
              </div>
            ) : (
              <div className="space-y-1">
                {files.map(date => (
                  <button
                    key={date}
                    onClick={() => onSelectDate(date)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                      date === currentDate
                        ? 'bg-accent/10 text-accent font-medium'
                        : 'hover:bg-accent/5 text-muted-foreground'
                    }`}
                  >
                    <Calendar className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 text-left">{formatDate(date)}</span>
                    <span className="text-xs opacity-60">{date}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Toggle button for desktop */}
      <button
        onClick={onToggle}
        className="hidden lg:flex fixed left-0 top-1/2 -translate-y-1/2 z-40 p-2 bg-background border border-border rounded-r-lg border-l-0 hover:bg-accent/5 transition-colors"
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    </>
  );
}
