/**
 * SeedWarningBlocker - Full-page blocker shown when seedFinishedGoodsLocations
 * has not been run for one or more GoBiz outlets.
 *
 * This is a hard blocker — no dismiss button. Admin must run the migration
 * from the Convex dashboard before the GoFood Depot page becomes usable.
 */

import { AlertTriangle } from 'lucide-react';

interface UnlinkedOutlet {
  id: string;
  name: string;
}

interface SeedWarningBlockerProps {
  unlinkedOutlets: UnlinkedOutlet[];
}

export function SeedWarningBlocker({ unlinkedOutlets }: SeedWarningBlockerProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md w-full bg-amber-50 border border-amber-200 rounded-xl p-8 shadow-sm">
        {/* Icon + Heading */}
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="h-8 w-8 text-amber-500 flex-shrink-0" />
          <h2 className="text-lg font-semibold text-amber-900">
            Finished Goods Inventory Not Initialized
          </h2>
        </div>

        {/* Explanation */}
        <p className="text-sm text-amber-800 mb-4">
          The following GoFood outlets do not have a linked storage location.
          The depot management page cannot be used until the seed migration is run.
        </p>

        {/* Unlinked outlet list */}
        {unlinkedOutlets.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-2">
              Unlinked Outlets
            </p>
            <ul className="space-y-1">
              {unlinkedOutlets.map((outlet) => (
                <li
                  key={outlet.id}
                  className="flex items-center gap-2 text-sm text-amber-800"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                  {outlet.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-amber-100 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
            How to fix
          </p>
          <p className="text-sm text-amber-800">
            Run the{' '}
            <code className="font-mono bg-amber-200 px-1 py-0.5 rounded text-xs">
              seedFinishedGoodsLocations
            </code>{' '}
            migration from the Convex dashboard Functions tab to initialize finished goods
            storage locations for each GoFood depot.
          </p>
        </div>
      </div>
    </div>
  );
}
