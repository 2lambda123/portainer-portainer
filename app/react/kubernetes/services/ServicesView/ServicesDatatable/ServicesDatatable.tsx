import { Shuffle } from 'lucide-react';
import { useRouter } from '@uirouter/react';
import clsx from 'clsx';
import { Row } from '@tanstack/react-table';

import { useEnvironmentId } from '@/react/hooks/useEnvironmentId';
import { Authorized, useAuthorizations } from '@/react/hooks/useUser';
import { notifyError, notifySuccess } from '@/portainer/services/notifications';
import { pluralize } from '@/portainer/helpers/strings';
import { DefaultDatatableSettings } from '@/react/kubernetes/datatables/DefaultDatatableSettings';
import { isSystemNamespace } from '@/react/kubernetes/namespaces/utils';
import { SystemResourceDescription } from '@/react/kubernetes/datatables/SystemResourceDescription';
import { useNamespacesQuery } from '@/react/kubernetes/namespaces/queries/useNamespacesQuery';
import { CreateFromManifestButton } from '@/react/kubernetes/components/CreateFromManifestButton';

import { Datatable, Table, TableSettingsMenu } from '@@/datatables';
import { useTableState } from '@@/datatables/useTableState';
import { DeleteButton } from '@@/buttons/DeleteButton';

import {
  useMutationDeleteServices,
  useServicesForCluster,
} from '../../service';
import { Service } from '../../types';

import { columns } from './columns';
import { createStore } from './datatable-store';

const storageKey = 'k8sServicesDatatable';
const settingsStore = createStore(storageKey);

export function ServicesDatatable() {
  const tableState = useTableState(settingsStore, storageKey);
  const environmentId = useEnvironmentId();
  const { data: namespaces, ...namespacesQuery } =
    useNamespacesQuery(environmentId);
  const namespaceNames = (namespaces && Object.keys(namespaces)) || [];
  const { data: services, ...servicesQuery } = useServicesForCluster(
    environmentId,
    namespaceNames,
    {
      autoRefreshRate: tableState.autoRefreshRate * 1000,
    }
  );

  const readOnly = !useAuthorizations(['K8sServiceW']);
  const canAccessSystemResources = useAuthorizations(
    'K8sAccessSystemNamespaces'
  );

  const filteredServices = services?.filter(
    (service) =>
      (canAccessSystemResources && tableState.showSystemResources) ||
      !isSystemNamespace(service.Namespace)
  );

  return (
    <Datatable
      dataset={filteredServices || []}
      columns={columns}
      settingsManager={tableState}
      isLoading={servicesQuery.isLoading || namespacesQuery.isLoading}
      emptyContentLabel="No services found"
      title="Services"
      titleIcon={Shuffle}
      getRowId={(row) => row.UID}
      isRowSelectable={(row) => !isSystemNamespace(row.original.Namespace)}
      disableSelect={readOnly}
      renderTableActions={(selectedRows) => (
        <TableActions selectedItems={selectedRows} />
      )}
      renderTableSettings={() => (
        <TableSettingsMenu>
          <DefaultDatatableSettings settings={tableState} />
        </TableSettingsMenu>
      )}
      description={
        <SystemResourceDescription
          showSystemResources={
            tableState.showSystemResources || !canAccessSystemResources
          }
        />
      }
      renderRow={servicesRenderRow}
    />
  );
}

// needed to apply custom styling to the row cells and not globally.
// required in the AC's for this ticket.
function servicesRenderRow(row: Row<Service>, highlightedItemId?: string) {
  return (
    <Table.Row<Service>
      cells={row.getVisibleCells()}
      className={clsx('[&>td]:!py-4 [&>td]:!align-top', {
        active: highlightedItemId === row.id,
      })}
    />
  );
}

interface SelectedService {
  Namespace: string;
  Name: string;
}

type TableActionsProps = {
  selectedItems: Service[];
};

function TableActions({ selectedItems }: TableActionsProps) {
  const environmentId = useEnvironmentId();
  const deleteServicesMutation = useMutationDeleteServices(environmentId);
  const router = useRouter();

  return (
    <Authorized authorizations="K8sServicesW">
      <DeleteButton
        disabled={selectedItems.length === 0}
        onConfirmed={() => handleRemoveClick(selectedItems)}
        confirmMessage={
          <>
            <p>{`Are you sure you want to remove the selected ${pluralize(
              selectedItems.length,
              'service'
            )}?`}</p>
            <ul className="pl-6">
              {selectedItems.map((s, index) => (
                <li key={index}>
                  {s.Namespace}/{s.Name}
                </li>
              ))}
            </ul>
          </>
        }
      />

      <CreateFromManifestButton />
    </Authorized>
  );

  async function handleRemoveClick(services: SelectedService[]) {
    const payload: Record<string, string[]> = {};
    services.forEach((service) => {
      payload[service.Namespace] = payload[service.Namespace] || [];
      payload[service.Namespace].push(service.Name);
    });

    deleteServicesMutation.mutate(
      { environmentId, data: payload },
      {
        onSuccess: () => {
          notifySuccess(
            'Services successfully removed',
            services.map((s) => `${s.Namespace}/${s.Name}`).join(', ')
          );
          router.stateService.reload();
        },
        onError: (error) => {
          notifyError(
            'Unable to delete service(s)',
            error as Error,
            services.map((s) => `${s.Namespace}/${s.Name}`).join(', ')
          );
        },
      }
    );
  }
}
