import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesApi, Category } from '../api/client';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { PlusIcon, PencilIcon, TrashIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface CategoryForm {
  name: string;
  description?: string;
  icon?: string;
  parentId?: string;
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { register, handleSubmit, reset, setValue } = useForm<CategoryForm>();

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Category>) => categoriesApi.create(data),
    onSuccess: () => {
      toast.success('Category created');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowModal(false);
      reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Category> }) =>
      categoriesApi.update(id, data),
    onSuccess: () => {
      toast.success('Category updated');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setEditingId(null);
      reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: () => {
      toast.success('Category deleted');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const onSubmit = (data: CategoryForm) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setValue('name', category.name);
    setValue('description', category.description || '');
    setValue('icon', category.icon || '');
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this category?')) {
      deleteMutation.mutate(id);
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  // Build tree structure
  const buildTree = (cats: Category[], parentId: string | null = null): Category[] => {
    return cats
      .filter((c) => c.parentId === parentId)
      .map((c) => ({ ...c, children: buildTree(cats, c.id) }));
  };

  const tree = categories ? buildTree(categories) : [];

  const renderCategory = (category: Category & { children?: Category[] }, depth = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedIds.has(category.id);

    return (
      <div key={category.id}>
        <div
          className={`flex items-center justify-between py-3 px-4 hover:bg-gray-50 ${
            depth > 0 ? 'ml-8 border-l border-gray-200' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            {hasChildren && (
              <button onClick={() => toggleExpand(category.id)} className="p-1">
                <ChevronRightIcon
                  className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                />
              </button>
            )}
            {!hasChildren && <div className="w-6" />}
            
            <div className="h-8 w-8 rounded-lg bg-honey-100 flex items-center justify-center">
              <span className="text-honey-600">{category.icon || '📦'}</span>
            </div>
            
            <div>
              <p className="font-medium text-gray-900">{category.name}</p>
              <p className="text-sm text-gray-500">
                {category._count?.businesses || 0} businesses
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`badge-${category.isActive ? 'success' : 'gray'}`}>
              {category.isActive ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={() => handleEdit(category)}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleDelete(category.id)}
              className="p-2 text-red-400 hover:text-red-600"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {category.children!.map((child) => renderCategory(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
          <p className="text-gray-500">Manage business categories</p>
        </div>
        <button
          onClick={() => {
            reset();
            setEditingId(null);
            setShowModal(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <PlusIcon className="h-5 w-5" />
          Add Category
        </button>
      </div>

      <div className="card p-0 divide-y divide-gray-200">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-honey-500 border-t-transparent rounded-full mx-auto"></div>
          </div>
        ) : tree.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No categories yet</div>
        ) : (
          tree.map((category) => renderCategory(category))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">
              {editingId ? 'Edit Category' : 'New Category'}
            </h2>
            
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input {...register('name', { required: true })} className="input" placeholder="Category name" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea {...register('description')} className="input" rows={3} placeholder="Optional description" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Icon (emoji)</label>
                <input {...register('icon')} className="input" placeholder="📦" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
                <select {...register('parentId')} className="input">
                  <option value="">None (Root)</option>
                  {categories?.filter((c: Category) => c.id !== editingId).map((c: Category) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
