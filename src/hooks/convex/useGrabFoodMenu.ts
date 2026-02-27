/**
 * Convex hooks for GrabFood Menu Simulator.
 * Bundles queries, mutations, and actions for menu item management.
 */
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";

/**
 * Hook bundling all GrabFood menu simulator operations.
 * - menuItems: reactive list of all grabfoodMenuItems (joined with menuProduct info)
 * - syncStatus: latest menu-related sync log entries
 * - Mutations: createItem, updateItem, deleteItem, reorderItems, generateUploadUrl, savePhoto, populateFromMappings
 * - Action: pushMenuChanges
 */
export function useGrabFoodMenu() {
  const menuItems = useQuery(api.grabfoodMenu.queries.listMenuItems);
  const syncStatus = useQuery(api.grabfoodMenu.queries.getSyncStatus);

  const createItem = useMutation(api.grabfoodMenu.mutations.createItem);
  const updateItem = useMutation(api.grabfoodMenu.mutations.updateItem);
  const deleteItem = useMutation(api.grabfoodMenu.mutations.deleteItem);
  const reorderItems = useMutation(api.grabfoodMenu.mutations.reorderItems);
  const generateUploadUrl = useMutation(api.grabfoodMenu.mutations.generateUploadUrl);
  const savePhoto = useMutation(api.grabfoodMenu.mutations.savePhoto);
  const populateFromMappings = useMutation(api.grabfoodMenu.mutations.populateFromMappings);

  const pushMenuChanges = useAction(api.integrations.grabfood.adapter.pushMenuChanges);

  return {
    menuItems,
    syncStatus,
    createItem,
    updateItem,
    deleteItem,
    reorderItems,
    generateUploadUrl,
    savePhoto,
    populateFromMappings,
    pushMenuChanges,
  };
}

/**
 * Hook for listing menu products (for the add-item dialog).
 * Uses the existing menuProducts.queries.list query.
 */
export function useMenuProductsList() {
  const data = useQuery(api.menuProducts.queries.list, { activeOnly: true });
  return { data, isLoading: data === undefined };
}
