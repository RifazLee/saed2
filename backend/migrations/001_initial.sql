CREATE TABLE operators (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('operator','admin') NOT NULL DEFAULT 'operator',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE materials (
  id CHAR(36) PRIMARY KEY,
  material_name VARCHAR(180) NOT NULL,
  chemical_formula VARCHAR(100) NOT NULL,
  phase VARCHAR(180) NOT NULL,
  description TEXT NULL,
  source VARCHAR(1000) NOT NULL,
  doi VARCHAR(500) NULL,
  notes TEXT NULL,
  crystal_system ENUM('Cubic','Tetragonal','Orthorhombic','Hexagonal','Trigonal / Rhombohedral','Monoclinic','Triclinic') NOT NULL,
  space_group_number SMALLINT UNSIGNED NOT NULL,
  space_group_symbol VARCHAR(80) NOT NULL,
  setting VARCHAR(80) NOT NULL DEFAULT 'Standard',
  lattice_json JSON NOT NULL,
  status ENUM('Draft','Calculated','Pending Validation','Validated','Rejected') NOT NULL DEFAULT 'Draft',
  current_version_id CHAR(36) NULL,
  validated_version_id CHAR(36) NULL,
  created_by CHAR(36) NOT NULL,
  validated_by CHAR(36) NULL,
  validated_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_material_status(status),
  INDEX idx_material_formula(chemical_formula),
  CONSTRAINT fk_material_creator FOREIGN KEY(created_by) REFERENCES operators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE material_versions (
  id CHAR(36) PRIMARY KEY,
  material_id CHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  lattice_a DOUBLE NOT NULL, lattice_b DOUBLE NOT NULL, lattice_c DOUBLE NOT NULL,
  alpha DOUBLE NOT NULL, beta DOUBLE NOT NULL, gamma DOUBLE NOT NULL,
  calculation_method VARCHAR(100) NOT NULL,
  calculation_parameters_json JSON NOT NULL,
  validation_status ENUM('Calculated','Pending Validation','Validated','Rejected') NOT NULL DEFAULT 'Calculated',
  validation_notes TEXT NULL,
  created_by CHAR(36) NOT NULL,
  validated_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  validated_at DATETIME NULL,
  UNIQUE KEY uq_material_version(material_id,version_number),
  INDEX idx_version_validation(validation_status),
  CONSTRAINT fk_version_material FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE CASCADE,
  CONSTRAINT fk_version_creator FOREIGN KEY(created_by) REFERENCES operators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE materials ADD CONSTRAINT fk_material_current_version FOREIGN KEY(current_version_id) REFERENCES material_versions(id) ON DELETE SET NULL;
ALTER TABLE materials ADD CONSTRAINT fk_material_validated_version FOREIGN KEY(validated_version_id) REFERENCES material_versions(id) ON DELETE SET NULL;

CREATE TABLE hkl_reflections (
  id CHAR(36) PRIMARY KEY,
  material_version_id CHAR(36) NOT NULL,
  h SMALLINT NOT NULL, k SMALLINT NOT NULL, l SMALLINT NOT NULL,
  d_angstrom DOUBLE NOT NULL,
  d_nanometer DOUBLE NOT NULL,
  inverse_d2 DOUBLE NOT NULL,
  reflection_status ENUM('Allowed','Forbidden','Requires SG verification') NOT NULL,
  calculation_method VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_version_hkl(material_version_id,h,k,l),
  INDEX idx_reflection_allowed(material_version_id,reflection_status),
  INDEX idx_reflection_d(material_version_id,d_angstrom),
  CONSTRAINT fk_reflection_version FOREIGN KEY(material_version_id) REFERENCES material_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE material_validation_audit (
  id CHAR(36) PRIMARY KEY,
  material_id CHAR(36) NOT NULL,
  material_version_id CHAR(36) NOT NULL,
  operator_id CHAR(36) NOT NULL,
  validation_status ENUM('Validated','Rejected') NOT NULL,
  validation_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_material(material_id,created_at),
  CONSTRAINT fk_audit_material FOREIGN KEY(material_id) REFERENCES materials(id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_version FOREIGN KEY(material_version_id) REFERENCES material_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_operator FOREIGN KEY(operator_id) REFERENCES operators(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
