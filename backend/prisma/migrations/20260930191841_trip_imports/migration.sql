-- CreateTable
CREATE TABLE `import_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `date_format` VARCHAR(20) NOT NULL,
    `km_mode` ENUM('START_END', 'DIRECT') NOT NULL,
    `driver_match_field` ENUM('CODE', 'LICENSE', 'PHONE', 'NAME') NOT NULL DEFAULT 'CODE',
    `duplicate_key` JSON NOT NULL,
    `keep_unmapped` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `import_templates_company_id_name_key`(`company_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_template_mappings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `template_id` INTEGER NOT NULL,
    `source_column` VARCHAR(150) NOT NULL,
    `target_field` VARCHAR(40) NOT NULL,

    UNIQUE INDEX `import_template_mappings_template_id_target_field_key`(`template_id`, `target_field`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trip_imports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `template_id` INTEGER NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `file_hash` CHAR(64) NOT NULL,
    `template_snapshot` JSON NOT NULL,
    `status` ENUM('VALIDATED', 'IMPORTED', 'DISCARDED', 'FAILED') NOT NULL DEFAULT 'VALIDATED',
    `total_rows` INTEGER NOT NULL DEFAULT 0,
    `valid_rows` INTEGER NOT NULL DEFAULT 0,
    `warning_rows` INTEGER NOT NULL DEFAULT 0,
    `error_rows` INTEGER NOT NULL DEFAULT 0,
    `duplicate_rows` INTEGER NOT NULL DEFAULT 0,
    `imported_rows` INTEGER NOT NULL DEFAULT 0,
    `error_details` TEXT NULL,
    `uploaded_by_id` INTEGER NULL,
    `imported_by_id` INTEGER NULL,
    `imported_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `trip_imports_company_id_created_at_idx`(`company_id`, `created_at`),
    INDEX `trip_imports_status_idx`(`status`),
    INDEX `trip_imports_file_hash_idx`(`file_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_rows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `import_id` INTEGER NOT NULL,
    `row_number` INTEGER NOT NULL,
    `raw` JSON NOT NULL,
    `normalized` JSON NULL,
    `status` ENUM('VALID', 'WARNING', 'ERROR', 'DUPLICATE', 'IMPORTED') NOT NULL,
    `messages` JSON NOT NULL,
    `trip_id` INTEGER NULL,

    INDEX `import_rows_import_id_status_idx`(`import_id`, `status`),
    UNIQUE INDEX `import_rows_import_id_row_number_key`(`import_id`, `row_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_import_id_fkey` FOREIGN KEY (`import_id`) REFERENCES `trip_imports`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_templates` ADD CONSTRAINT `import_templates_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_templates` ADD CONSTRAINT `import_templates_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_template_mappings` ADD CONSTRAINT `import_template_mappings_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `import_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trip_imports` ADD CONSTRAINT `trip_imports_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trip_imports` ADD CONSTRAINT `trip_imports_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `import_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trip_imports` ADD CONSTRAINT `trip_imports_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trip_imports` ADD CONSTRAINT `trip_imports_imported_by_id_fkey` FOREIGN KEY (`imported_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_rows` ADD CONSTRAINT `import_rows_import_id_fkey` FOREIGN KEY (`import_id`) REFERENCES `trip_imports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
