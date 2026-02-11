import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import userService from "../services/userService";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { ArrowLeft, Save, Pencil, X } from "lucide-react";

interface UserFormData extends Record<string, unknown> {
  username: string;
  email: string;
  firstname: string;
  middlename: string;
  lastname: string;
  is_active: boolean;
}

const UserEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [formData, setFormData] = useState<UserFormData>({
    username: "",
    email: "",
    firstname: "",
    middlename: "",
    lastname: "",
    is_active: true,
  });
  const [loading, setLoading] = useState(!isNew);
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [savedFormData, setSavedFormData] = useState<UserFormData>(formData);

  const handleEditToggle = () => {
    setSavedFormData(formData);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setFormData(savedFormData);
    setEditing(false);
    setError("");
  };

  useEffect(() => {
    if (!isNew) {
      fetchUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const data = await userService.getById(id!);
      const user = data.data || data;
      const loaded: UserFormData = {
        username: user.username || "",
        email: user.email || "",
        firstname: user.firstname || "",
        middlename: user.middlename || "",
        lastname: user.lastname || "",
        is_active: user.is_active ?? true,
      };
      setFormData(loaded);
      setSavedFormData(loaded);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError("Failed to load user: " + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (isNew) {
        const result = await userService.create(formData);
        const created = result.data || result;
        if (created?.id) {
          navigate(`/users/${created.id}/edit`, { replace: true });
        } else {
          navigate("/users");
        }
      } else {
        await userService.update(id!, formData);
        await fetchUser();
        setEditing(false);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError("Failed to save user: " + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{isNew ? "Add User" : "Edit User"}</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/users")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {isNew ? "Add User" : editing ? "Edit User" : "User Details"}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
              {isNew ? "Create a new user" : editing ? "Update user information" : "View user information"}
            </p>
          </div>
          {!isNew && !editing && (
            <Button variant="outline" size="sm" onClick={handleEditToggle}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>

        {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}

        <Card>
          <CardHeader>
            <CardTitle>User Details</CardTitle>
            <CardDescription>
              {isNew
                ? "Fill in the details for the new user"
                : editing
                  ? "Modify the user details below"
                  : "User information"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username {editing && "*"}</Label>
                {editing ? (
                  <Input
                    type="text"
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    placeholder="Username"
                    required
                  />
                ) : (
                  <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                    {formData.username || "-"}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email {editing && "*"}</Label>
                {editing ? (
                  <Input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email address"
                    required
                  />
                ) : (
                  <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                    {formData.email || "-"}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstname">First Name</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="firstname"
                      name="firstname"
                      value={formData.firstname}
                      onChange={handleChange}
                      placeholder="First name"
                    />
                  ) : (
                    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                      {formData.firstname || "-"}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="middlename">Middle Name</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="middlename"
                      name="middlename"
                      value={formData.middlename}
                      onChange={handleChange}
                      placeholder="Middle name"
                    />
                  ) : (
                    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                      {formData.middlename || "-"}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastname">Last Name</Label>
                  {editing ? (
                    <Input
                      type="text"
                      id="lastname"
                      name="lastname"
                      value={formData.lastname}
                      onChange={handleChange}
                      placeholder="Last name"
                    />
                  ) : (
                    <div className="flex h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm items-center">
                      {formData.lastname || "-"}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <input
                      type="checkbox"
                      id="is_active"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleChange}
                      className="h-4 w-4 rounded border-input"
                    />
                    <Label htmlFor="is_active">Active</Label>
                  </>
                ) : (
                  <>
                    <Label>Status</Label>
                    <Badge variant={formData.is_active ? "success" : "secondary"} className="ml-2">
                      {formData.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </>
                )}
              </div>

              {editing && (
                <div className="flex gap-3 pt-4">
                  <Button type="submit" size="sm" disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Saving..." : isNew ? "Create User" : "Save Changes"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={isNew ? () => navigate("/users") : handleCancelEdit}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default UserEdit;
