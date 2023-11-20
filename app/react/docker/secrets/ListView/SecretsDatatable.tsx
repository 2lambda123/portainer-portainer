import { createColumnHelper } from '@tanstack/react-table';
import { Lock } from 'lucide-react';

import { SecretViewModel } from '@/docker/models/secret';
import { isoDate } from '@/portainer/filters/filters';

import { buildNameColumn } from '@@/datatables/buildNameColumn';
import { Datatable, TableSettingsMenu } from '@@/datatables';
import {
  BasicTableSettings,
  RefreshableTableSettings,
  createPersistedStore,
  refreshableSettings,
} from '@@/datatables/types';
import { useTableState } from '@@/datatables/useTableState';
import { TableSettingsMenuAutoRefresh } from '@@/datatables/TableSettingsMenuAutoRefresh';
import { AddButton } from '@@/buttons';
import { useRepeater } from '@@/datatables/useRepeater';
import { DeleteButton } from '@@/buttons/DeleteButton';

import { createOwnershipColumn } from '../../components/datatable/createOwnershipColumn';

const columnHelper = createColumnHelper<SecretViewModel>();

const columns = [
  buildNameColumn<SecretViewModel>('Name', '.secret'),
  columnHelper.accessor((item) => isoDate(item.CreatedAt), {
    header: 'Creation Date',
  }),
  createOwnershipColumn<SecretViewModel>(),
];

interface TableSettings extends BasicTableSettings, RefreshableTableSettings {}

const storageKey = 'docker-secrets';
const store = createPersistedStore<TableSettings>(
  storageKey,
  undefined,
  (set) => ({
    ...refreshableSettings(set),
  })
);

export function SecretsDatatable({
  dataset,
  onRemove,
  onRefresh,
}: {
  dataset?: Array<SecretViewModel>;
  onRemove(items: Array<SecretViewModel>): void;
  onRefresh(): Promise<void>;
}) {
  const tableState = useTableState(store, storageKey);
  useRepeater(tableState.autoRefreshRate, onRefresh);

  return (
    <Datatable
      title="Secrets"
      titleIcon={Lock}
      columns={columns}
      dataset={dataset || []}
      isLoading={!dataset}
      settingsManager={tableState}
      emptyContentLabel="No secret available."
      renderTableActions={(selectedItems) => (
        <TableActions selectedItems={selectedItems} onRemove={onRemove} />
      )}
      renderTableSettings={() => (
        <TableSettingsMenu>
          <TableSettingsMenuAutoRefresh
            value={tableState.autoRefreshRate}
            onChange={(value) => tableState.setAutoRefreshRate(value)}
          />
        </TableSettingsMenu>
      )}
    />
  );
}

function TableActions({
  selectedItems,
  onRemove,
}: {
  selectedItems: Array<SecretViewModel>;
  onRemove(items: Array<SecretViewModel>): void;
}) {
  return (
    <div className="flex items-center gap-2">
      <DeleteButton
        disabled={selectedItems.length === 0}
        onConfirmed={() => onRemove(selectedItems)}
        confirmMessage="Do you want to remove the selected secret(s)?"
        data-cy="secret-removeSecretButton"
      />

      <AddButton data-cy="secret-addSecretButton">Add secret</AddButton>
    </div>
  );
}
