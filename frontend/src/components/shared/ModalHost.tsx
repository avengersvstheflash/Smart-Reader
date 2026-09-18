import { useModalStore, ModalName } from '../../store/useModalStore';
import { Modal } from './Modal';
import { DeleteBookConfirmContent } from '../modals/DeleteBookConfirmContent';
import { AddChapterContent } from '../modals/AddChapterContent';

interface ModalConfig {
  title: string;
  size: 'sm' | 'md' | 'lg';
  danger?: boolean;
  closeOnBackdrop?: boolean;
}

const configs: Record<ModalName, ModalConfig> = {
  deleteBook: {
    title: 'Delete book',
    size: 'sm',
    danger: true,
    closeOnBackdrop: false,
  },
  addChapter: {
    title: 'Add chapter',
    size: 'md',
  },
};

export function ModalHost() {
  const active = useModalStore((s) => s.active);
  const close = useModalStore((s) => s.close);

  if (!active) return null;

  const config = configs[active.name];
  if (!config) return null;

  const renderContent = () => {
    switch (active.name) {
      case 'deleteBook':
        return (
          <DeleteBookConfirmContent
            close={close}
            bookId={active.props.bookId as string}
            bookTitle={active.props.bookTitle as string}
            chapterCount={active.props.chapterCount as number}
          />
        );
      case 'addChapter':
        return (
          <AddChapterContent
            close={close}
            bookId={active.props.bookId as string}
            nextNumber={active.props.nextNumber as number}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      open={Boolean(active)}
      onClose={() => close()}
      title={config.title}
      size={config.size}
      danger={config.danger}
      closeOnBackdrop={config.closeOnBackdrop ?? true}
    >
      {renderContent()}
    </Modal>
  );
}
