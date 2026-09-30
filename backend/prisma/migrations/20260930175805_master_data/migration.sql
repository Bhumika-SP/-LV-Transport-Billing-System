-- CreateTable
CREATE TABLE `companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(20) NULL,
    `name` VARCHAR(150) NOT NULL,
    `contact_person` VARCHAR(100) NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `gstin` VARCHAR(15) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `notes` TEXT NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `companies_code_key`(`code`),
    UNIQUE INDEX `companies_name_key`(`name`),
    INDEX `companies_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `drivers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `driver_code` VARCHAR(20) NOT NULL,
    `full_name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(15) NOT NULL,
    `alternate_phone` VARCHAR(15) NULL,
    `address` TEXT NULL,
    `joining_date` DATE NULL,
    `license_number` VARCHAR(30) NULL,
    `license_expiry_date` DATE NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `bank_account_name` VARCHAR(100) NULL,
    `bank_account_number` VARCHAR(30) NULL,
    `bank_ifsc` VARCHAR(11) NULL,
    `bank_name` VARCHAR(100) NULL,
    `upi_id` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `drivers_driver_code_key`(`driver_code`),
    UNIQUE INDEX `drivers_license_number_key`(`license_number`),
    INDEX `drivers_status_idx`(`status`),
    INDEX `drivers_full_name_idx`(`full_name`),
    INDEX `drivers_phone_idx`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicle_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(255) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vehicle_types_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicle_type_rates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vehicle_type_id` INTEGER NOT NULL,
    `rate_per_km` DECIMAL(10, 2) NOT NULL,
    `effective_from` DATE NOT NULL,
    `effective_to` DATE NULL,
    `status` ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `notes` VARCHAR(255) NULL,
    `cancel_reason` VARCHAR(255) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancelled_by_id` INTEGER NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `vehicle_type_rates_vehicle_type_id_status_effective_from_idx`(`vehicle_type_id`, `status`, `effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `registration_number` VARCHAR(20) NOT NULL,
    `vehicle_type_id` INTEGER NOT NULL,
    `make` VARCHAR(50) NULL,
    `model` VARCHAR(50) NULL,
    `year` SMALLINT NULL,
    `fuel_type` ENUM('PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID', 'LPG', 'OTHER') NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `insurance_provider` VARCHAR(100) NULL,
    `insurance_policy_number` VARCHAR(50) NULL,
    `insurance_expiry_date` DATE NULL,
    `fitness_certificate_number` VARCHAR(50) NULL,
    `fitness_expiry_date` DATE NULL,
    `permit_number` VARCHAR(50) NULL,
    `permit_expiry_date` DATE NULL,
    `notes` TEXT NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vehicles_registration_number_key`(`registration_number`),
    INDEX `vehicles_vehicle_type_id_idx`(`vehicle_type_id`),
    INDEX `vehicles_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicle_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vehicle_id` INTEGER NOT NULL,
    `company_id` INTEGER NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `notes` VARCHAR(255) NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `vehicle_assignments_vehicle_id_start_date_idx`(`vehicle_id`, `start_date`),
    INDEX `vehicle_assignments_company_id_start_date_idx`(`company_id`, `start_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `driver_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `driver_id` INTEGER NOT NULL,
    `vehicle_id` INTEGER NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `notes` VARCHAR(255) NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `driver_assignments_driver_id_start_date_idx`(`driver_id`, `start_date`),
    INDEX `driver_assignments_vehicle_id_start_date_idx`(`vehicle_id`, `start_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `companies` ADD CONSTRAINT `companies_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drivers` ADD CONSTRAINT `drivers_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_types` ADD CONSTRAINT `vehicle_types_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_type_rates` ADD CONSTRAINT `vehicle_type_rates_vehicle_type_id_fkey` FOREIGN KEY (`vehicle_type_id`) REFERENCES `vehicle_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_type_rates` ADD CONSTRAINT `vehicle_type_rates_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_type_rates` ADD CONSTRAINT `vehicle_type_rates_cancelled_by_id_fkey` FOREIGN KEY (`cancelled_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_vehicle_type_id_fkey` FOREIGN KEY (`vehicle_type_id`) REFERENCES `vehicle_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_assignments` ADD CONSTRAINT `vehicle_assignments_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_assignments` ADD CONSTRAINT `vehicle_assignments_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_assignments` ADD CONSTRAINT `vehicle_assignments_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_assignments` ADD CONSTRAINT `driver_assignments_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `drivers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_assignments` ADD CONSTRAINT `driver_assignments_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_assignments` ADD CONSTRAINT `driver_assignments_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
