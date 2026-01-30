import { useQuery } from '@tanstack/react-query';
import { menuProductApi } from '../lib/api';

export const menuProductKeys = {
    all: ['menu-products'] as const,
    lists: () => [...menuProductKeys.all, 'list'] as const,
    list: (activeOnly: boolean) => [...menuProductKeys.lists(), { activeOnly }] as const,
};

export function useMenuProducts(activeOnly: boolean = true) {
    return useQuery({
        queryKey: menuProductKeys.list(activeOnly),
        queryFn: () => menuProductApi.list(activeOnly),
    });
}
