import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import clusterService from '../services/clusterService';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

const ClusterManagement = () => {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCluster, setEditingCluster] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active'
  });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchClusters();
  }, []);

  const fetchClusters = async () => {
    try {
      setLoading(true);
      const data = await clusterService.getAll();
      setClusters(Array.isArray(data) ? data : data.data || []);
      setError('');
    } catch (err) {
      setError('Failed to load clusters: ' + (err.response?.data?.message || err.message));
      console.error('Error fetching clusters:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingCluster(null);
    setFormData({ name: '', description: '', status: 'active' });
    setShowModal(true);
  };

  const handleEdit = (cluster) => {
    setEditingCluster(cluster);
    setFormData({
      name: cluster.name || '',
      description: cluster.description || '',
      status: cluster.status || 'active'
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this cluster?')) {
      return;
    }

    try {
      await clusterService.delete(id);
      fetchClusters();
    } catch (err) {
      alert('Failed to delete cluster: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingCluster) {
        await clusterService.update(editingCluster.id, formData);
      } else {
        await clusterService.create(formData);
      }
      setShowModal(false);
      fetchClusters();
    } catch (err) {
      alert('Failed to save cluster: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const filteredClusters = clusters.filter(cluster =>
    cluster.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cluster.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cluster Management</h1>
            <p className="text-muted-foreground mt-2">Manage and configure clusters</p>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add Cluster
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search clusters..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && <div className="text-center py-8 text-muted-foreground">Loading clusters...</div>}
            {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}

            {!loading && !error && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClusters.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No clusters found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredClusters.map((cluster) => (
                      <TableRow key={cluster.id}>
                        <TableCell className="font-medium">{cluster.id}</TableCell>
                        <TableCell>{cluster.name}</TableCell>
                        <TableCell>{cluster.description}</TableCell>
                        <TableCell>
                          <Badge variant={cluster.status === 'active' ? 'success' : 'secondary'}>
                            {cluster.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button onClick={() => handleEdit(cluster)} variant="outline" size="sm">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button onClick={() => handleDelete(cluster.id)} variant="destructive" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCluster ? 'Edit Cluster' : 'Add Cluster'}</DialogTitle>
            <DialogDescription>
              {editingCluster ? 'Update cluster information' : 'Create a new cluster'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows="3"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingCluster ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default ClusterManagement;
