import React from 'react';
import ConfirmDialog from './common/ConfirmDialog';

interface DeleteTenantDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  tenantName?: string;
  isDeleting?: boolean;
}

const DeleteTenantDialog: React.FC<DeleteTenantDialogProps> = ({
  open,
  onClose,
  onConfirm,
  tenantName,
  isDeleting = false,
}) => {
  const message = tenantName 
    ? `Are you sure you want to delete tenant "${tenantName}"?\nThis action cannot be undone.`
    : 'Are you sure you want to delete this tenant?\nThis action cannot be undone.';

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Delete Tenant"
      message={message}
      confirmText="Delete"
      cancelText="Cancel"
      isLoading={isDeleting}
      severity="error"
      icon="✕"
    />
  );
};

export default DeleteTenantDialog;