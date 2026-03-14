/**
 * BankAccountsManager -- Admin-only company bank accounts CRUD page.
 * Uses EntityManager generic component with factory mutation hooks.
 * Follows AccountsManager pattern from Phase 43.
 */

import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EntityManager } from "@/components/shared/EntityManager";
import type { EntityColumn } from "@/components/shared/EntityManager";
import {
  useBankAccounts,
  useCreateBankAccount,
  useUpdateBankAccount,
  useDeleteBankAccount,
  type BankAccount,
} from "@/hooks/convex";
import type { Id } from "../../convex/_generated/dataModel";

const columns: EntityColumn<BankAccount>[] = [
  { key: "name", header: "Account Name", sortable: true },
  { key: "bankName", header: "Bank", sortable: true },
  { key: "accountNumber", header: "Account Number" },
  {
    key: "status",
    header: "Status",
    render: (item) =>
      item.isActive ? (
        <span className="text-sm text-muted-foreground">Active</span>
      ) : (
        <Badge variant="destructive">Inactive</Badge>
      ),
  },
];

export function BankAccountsManager() {
  useDocumentTitle("Company Bank Accounts");

  const bankAccounts = useBankAccounts();
  const create = useCreateBankAccount();
  const update = useUpdateBankAccount();
  const del = useDeleteBankAccount();

  return (
    <EntityManager<BankAccount>
      entityName="Bank Account"
      entityNamePlural="Bank Accounts"
      pageTitle="Company Bank Accounts"
      pageDescription="Manage bank accounts used for reimbursement transfers"
      icon={Landmark}
      items={bankAccounts}
      columns={columns}
      searchable
      searchKeys={["name", "bankName", "accountNumber"]}
      searchPlaceholder="Search by name or bank..."
      defaultView="table"
      formSections={[
        {
          fields: [
            {
              name: "name",
              label: "Account Name",
              type: "text",
              required: true,
              placeholder: "e.g., BCA Payroll",
            },
            {
              name: "bankName",
              label: "Bank Name",
              type: "text",
              required: true,
              placeholder: "e.g., BCA",
            },
            {
              name: "accountNumber",
              label: "Account Number",
              type: "text",
              required: true,
              placeholder: "e.g., 1234567890",
            },
            {
              name: "isActive",
              label: "Active",
              type: "checkbox",
              placeholder: "Account is active and available for transfers",
              hideIf: (data: Record<string, unknown>) => !data._isEditing,
            },
          ],
        },
      ]}
      getFormDefaults={() => ({
        name: "",
        bankName: "",
        accountNumber: "",
        _isEditing: false,
      })}
      getFormInitialData={(item) => ({
        name: item.name,
        bankName: item.bankName,
        accountNumber: item.accountNumber,
        isActive: item.isActive,
        _isEditing: true,
      })}
      transformFormData={(data) => {
        const { _isEditing, ...rest } = data;
        return rest;
      }}
      canDelete={() => true}
      onCreate={(data) =>
        create.mutate({
          name: data.name as string,
          bankName: data.bankName as string,
          accountNumber: data.accountNumber as string,
        })
      }
      onUpdate={(id, data) =>
        update.mutate({
          bankAccountId: id as Id<"bankAccounts">,
          ...data,
        })
      }
      onDelete={(id) =>
        del.mutate({ bankAccountId: id as Id<"bankAccounts"> })
      }
    />
  );
}
