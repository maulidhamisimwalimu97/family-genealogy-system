-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Apr 13, 2026 at 08:50 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `family_genealogy`
--

-- --------------------------------------------------------

--
-- Table structure for table `activity_log`
--

CREATE TABLE `activity_log` (
  `log_id` int(11) NOT NULL,
  `member_id` int(11) DEFAULT NULL,
  `action` varchar(200) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `chat_message`
--

CREATE TABLE `chat_message` (
  `message_id` int(11) NOT NULL,
  `room_id` int(11) DEFAULT NULL,
  `sender_id` int(11) DEFAULT NULL,
  `receiver_id` int(11) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `sent_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `seen` tinyint(4) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `chat_message`
--

INSERT INTO `chat_message` (`message_id`, `room_id`, `sender_id`, `receiver_id`, `message`, `image`, `sent_at`, `seen`) VALUES
(17, NULL, 19, NULL, 'mnafanya kazi nzuri', NULL, '2026-04-08 05:29:56', 0),
(18, NULL, 3, NULL, 'haha ni kweli', NULL, '2026-04-11 16:54:55', 0),
(19, NULL, 3, 19, 'dogo', NULL, '2026-04-12 05:20:52', 1),
(20, NULL, 19, 3, 'nambie kaka', NULL, '2026-04-13 06:39:52', 0);

-- --------------------------------------------------------

--
-- Table structure for table `chat_room`
--

CREATE TABLE `chat_room` (
  `room_id` int(11) NOT NULL,
  `family_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `member_a` int(11) DEFAULT NULL,
  `member_b` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `chat_room`
--

INSERT INTO `chat_room` (`room_id`, `family_id`, `created_at`, `member_a`, `member_b`) VALUES
(1, 3, '2026-03-28 05:09:34', NULL, NULL),
(2, 3, '2026-03-28 05:28:23', 3, 4);

-- --------------------------------------------------------

--
-- Table structure for table `drive_file`
--

CREATE TABLE `drive_file` (
  `file_id` int(11) NOT NULL,
  `drive_id` int(11) DEFAULT NULL,
  `uploaded_by` int(11) DEFAULT NULL,
  `folder_id` int(11) DEFAULT NULL,
  `file_name` varchar(200) DEFAULT NULL,
  `file_path` varchar(300) DEFAULT NULL,
  `file_type` varchar(50) DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `family`
--

CREATE TABLE `family` (
  `family_id` int(11) NOT NULL,
  `family_name` varchar(120) NOT NULL,
  `tribe` varchar(100) DEFAULT NULL,
  `region` varchar(100) DEFAULT NULL,
  `religion` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `registered_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `permissions` text DEFAULT NULL,
  `only_admin_chat` tinyint(1) DEFAULT 0,
  `package_id` int(11) DEFAULT NULL,
  `package_status` enum('trial','active','expired','pending') DEFAULT 'trial',
  `expiry_date` datetime DEFAULT NULL,
  `package_type` varchar(20) DEFAULT 'trial',
  `trial_ends_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `payment_status` enum('pending','paid') DEFAULT 'pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `family`
--

INSERT INTO `family` (`family_id`, `family_name`, `tribe`, `region`, `religion`, `address`, `phone`, `registered_by`, `created_at`, `permissions`, `only_admin_chat`, `package_id`, `package_status`, `expiry_date`, `package_type`, `trial_ends_at`, `is_active`, `payment_status`) VALUES
(3, 'Kitogo Family', 'Digo', 'Tanga', 'Islam', 'P.O.Box 644', '255756478765', 1, '2026-03-08 07:17:48', '', 0, NULL, 'active', NULL, 'active', NULL, 1, 'paid'),
(20, 'Bangili Family', 'Digo', 'Morogoro', 'Islam', 'P.O.Box 644', '255742700830', 1, '2026-04-12 15:32:37', '', 0, NULL, 'trial', NULL, 'trial', '2026-04-13 18:32:37', 1, 'pending');

-- --------------------------------------------------------

--
-- Table structure for table `family_drive`
--

CREATE TABLE `family_drive` (
  `drive_id` int(11) NOT NULL,
  `family_id` int(11) DEFAULT NULL,
  `folder_name` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `family_drive`
--

INSERT INTO `family_drive` (`drive_id`, `family_id`, `folder_name`, `created_at`) VALUES
(3, 3, 'fss', '2026-04-01 10:57:27'),
(4, 3, 'mau', '2026-04-01 11:35:32');

-- --------------------------------------------------------

--
-- Table structure for table `family_event`
--

CREATE TABLE `family_event` (
  `event_id` int(11) NOT NULL,
  `family_id` int(11) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `event_type` enum('msiba','sherehe','mkutano','nyingine') DEFAULT 'nyingine',
  `event_date` date NOT NULL,
  `event_time` time DEFAULT NULL,
  `location` varchar(200) DEFAULT NULL,
  `has_contribution` tinyint(1) DEFAULT 0,
  `target_amount` decimal(15,2) DEFAULT 0.00,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `family_event`
--

INSERT INTO `family_event` (`event_id`, `family_id`, `title`, `description`, `event_type`, `event_date`, `event_time`, `location`, `has_contribution`, `target_amount`, `created_by`, `created_at`) VALUES
(8, 3, 'Kharusi ya juma', 'harusi ya juma mtoto wa mwalimu', 'sherehe', '2026-04-17', '09:34:00', 'Mzumbe', 1, 700000.00, 3, '2026-04-12 05:34:02'),
(9, 3, 'Kharusi ya munnie', 'fhdfjdhaf', 'sherehe', '2026-04-14', '10:32:00', 'MOROGORO', 1, 50000.00, 3, '2026-04-12 06:32:08');

-- --------------------------------------------------------

--
-- Table structure for table `family_member`
--

CREATE TABLE `family_member` (
  `member_id` int(11) NOT NULL,
  `family_id` int(11) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `middle_name` varchar(30) NOT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `gender` enum('male','female') DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(120) DEFAULT NULL,
  `role` enum('family_admin','member','dependent') NOT NULL,
  `is_future_head` tinyint(1) DEFAULT 0,
  `password` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `registered_by` int(11) DEFAULT NULL,
  `relationship` varchar(20) NOT NULL DEFAULT '',
  `branch_type` varchar(50) DEFAULT NULL,
  `profile_image` varchar(255) DEFAULT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `spouse_id` int(11) DEFAULT NULL,
  `father_id` int(11) DEFAULT NULL,
  `mother_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `family_member`
--

INSERT INTO `family_member` (`member_id`, `family_id`, `first_name`, `middle_name`, `last_name`, `gender`, `date_of_birth`, `phone`, `email`, `role`, `is_future_head`, `password`, `created_at`, `registered_by`, `relationship`, `branch_type`, `profile_image`, `parent_id`, `spouse_id`, `father_id`, `mother_id`) VALUES
(3, 3, 'Ally', '', '  Kitogo', 'male', '1952-03-09', '255742700833', NULL, 'family_admin', 0, '$2b$10$yfJhGJRsfwHspoLTMG0kEuyCH1j31MiglKABpRL720E9t/EhvqArm', '2026-03-08 07:17:48', NULL, '', NULL, '/uploads/drives/1775322851312.png', NULL, 24, NULL, NULL),
(19, 3, 'MAULID', 'HAMISI', 'MWALIMU', 'male', '2002-01-08', '255742700837', NULL, 'member', 0, '$2a$12$t1hmSCsx1U8CmGGMWnjnJOOm9MoZtJproRAKiWHHzuXZJiyNT0try', '2026-04-07 10:34:56', 3, 'child', 'origin', '/uploads/drives/1775628250988.png', NULL, NULL, NULL, NULL),
(20, 3, 'Salama ', 'Ally', 'Kitogo', 'female', '2001-05-16', '0742700838', 'daniel12@gmail.com', 'member', 0, '$2b$10$.AIoODh./s8sSGk8xB159Ovb7w1RANS46pRXotuu6di.nTykyv4tm', '2026-04-09 11:35:22', 3, 'child', 'origin', NULL, 3, NULL, 3, 21),
(21, 3, 'Zuhura ', 'Omary', 'Cheni', 'female', '2000-05-09', '0742700839', 'daniel12@gmail.com', 'member', 0, '$2b$10$qzkeVBLRJ9izhqXre6aEY.snuQCu6RFZSQYtEn7SWl8MYuRJdpLlC', '2026-04-09 11:39:12', 3, 'spouse', 'new_branch', NULL, NULL, 3, NULL, NULL),
(22, 3, 'Zuhura ', 'Ally', 'Mwalimu', 'female', '1995-01-09', '255659671357', 'alexmarco1@gmail.com', 'member', 0, '$2b$10$9uIYalNIJNvR70sRpRm/4.6Z91az4jwji72iUuym4FRm//MY8aeSW', '2026-04-09 11:49:42', 3, 'spouse', 'origin', NULL, NULL, NULL, 3, 21),
(23, 3, 'hadija', 'Ally', 'Mwalimu', 'female', '2026-04-06', '255742700000', 'daniel12@gmail.com', 'dependent', 0, '$2b$10$h5RvBCBL/.vHe5gpyEVL2OSYZkdrPblxFzZroN2RY7EH6xLCgSZ7O', '2026-04-11 15:39:56', 3, 'child', 'origin', NULL, NULL, NULL, 3, 21),
(24, 3, 'Sakina', 'O', 'Cheni', 'female', '2009-01-11', '255742707777', NULL, 'dependent', 0, '$2b$10$Jeaoae.S/AGbXGqFrp1c3O8ndDzWun1GDY8cg7ctZzBovtIssuytG', '2026-04-11 18:03:23', 3, 'spouse', 'origin', NULL, NULL, 3, NULL, NULL),
(25, 20, 'YAHAYA', 'HAMISI', 'MWALIMU', 'male', NULL, '255742700830', '', 'family_admin', 0, '$2b$10$FtSIccHIkq.O7PHOC.1VMuOHFt86/1hbu6IBvwjH8W/FvidgsmjPm', '2026-04-12 15:32:37', NULL, '', NULL, NULL, NULL, NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `meeting`
--

CREATE TABLE `meeting` (
  `meeting_id` int(11) NOT NULL,
  `family_id` int(11) DEFAULT NULL,
  `title` varchar(150) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `meeting_date` date DEFAULT NULL,
  `meeting_time` time DEFAULT NULL,
  `location` varchar(200) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `meeting_attendance`
--

CREATE TABLE `meeting_attendance` (
  `attendance_id` int(11) NOT NULL,
  `meeting_id` int(11) DEFAULT NULL,
  `member_id` int(11) DEFAULT NULL,
  `status` enum('present','absent') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `packages`
--

CREATE TABLE `packages` (
  `id` int(11) NOT NULL,
  `name` varchar(50) DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `duration_days` int(11) DEFAULT NULL,
  `features` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `packages`
--

INSERT INTO `packages` (`id`, `name`, `price`, `duration_days`, `features`) VALUES
(1, 'monthly', 10000.00, 30, NULL),
(2, 'yearly', 100000.00, 365, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `payment`
--

CREATE TABLE `payment` (
  `payment_id` int(11) NOT NULL,
  `family_id` int(11) DEFAULT NULL,
  `event_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `payment_type` varchar(100) DEFAULT NULL,
  `payment_method` enum('cash','mobile_money','bank') DEFAULT NULL,
  `status` enum('pledge','paid','rejected') DEFAULT 'pledge',
  `payment_date` date DEFAULT NULL,
  `recorded_by` int(11) DEFAULT NULL,
  `note` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `payment`
--

INSERT INTO `payment` (`payment_id`, `family_id`, `event_id`, `amount`, `reference_number`, `payment_type`, `payment_method`, `status`, `payment_date`, `recorded_by`, `note`) VALUES
(10, 3, 8, 40000.00, 'trfyugkhjhkjb', 'event', NULL, 'paid', '2026-04-12', 3, 'Mchango wa tukio'),
(11, 3, 8, 5000.00, 'trfyugkhjhkjb', 'event', NULL, 'paid', '2026-04-12', 3, 'Mchango wa tukio (unasubiri approval)'),
(12, 3, NULL, 10000.00, 'trfyugkhjhkjb', 'monthly', NULL, 'paid', '2026-04-13', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `system_admin`
--

CREATE TABLE `system_admin` (
  `admin_id` int(11) NOT NULL,
  `role` enum('Admin','Assistant') NOT NULL,
  `full_name` varchar(120) NOT NULL,
  `email` varchar(120) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `system_admin`
--

INSERT INTO `system_admin` (`admin_id`, `role`, `full_name`, `email`, `phone`, `password`, `created_at`) VALUES
(1, 'Admin', 'Omary Salum', 'ommary23@gmail.com', '0615121044', '$2b$10$PKET3AHJt5s8OpjtaUi/j.rxCLGAasl.hFWE5.CETq37WoEcLCZb2', '2026-03-07 06:43:01'),
(2, 'Assistant', 'Maulid Mwalimu', 'hope@gmail.com', '0742700833', '$2b$10$qDXLYsU0BiRNIr7petm3XOwDHL9SqfF21BqTh04CqkZzNp9i0t6N.', '2026-03-08 06:48:45');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `activity_log`
--
ALTER TABLE `activity_log`
  ADD PRIMARY KEY (`log_id`),
  ADD KEY `member_id` (`member_id`);

--
-- Indexes for table `chat_message`
--
ALTER TABLE `chat_message`
  ADD PRIMARY KEY (`message_id`),
  ADD KEY `room_id` (`room_id`),
  ADD KEY `sender_id` (`sender_id`);

--
-- Indexes for table `chat_room`
--
ALTER TABLE `chat_room`
  ADD PRIMARY KEY (`room_id`),
  ADD KEY `family_id` (`family_id`);

--
-- Indexes for table `drive_file`
--
ALTER TABLE `drive_file`
  ADD PRIMARY KEY (`file_id`),
  ADD KEY `drive_id` (`drive_id`),
  ADD KEY `uploaded_by` (`uploaded_by`);

--
-- Indexes for table `family`
--
ALTER TABLE `family`
  ADD PRIMARY KEY (`family_id`),
  ADD KEY `registered_by` (`registered_by`);

--
-- Indexes for table `family_drive`
--
ALTER TABLE `family_drive`
  ADD PRIMARY KEY (`drive_id`),
  ADD KEY `family_id` (`family_id`);

--
-- Indexes for table `family_event`
--
ALTER TABLE `family_event`
  ADD PRIMARY KEY (`event_id`),
  ADD KEY `family_id` (`family_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `family_member`
--
ALTER TABLE `family_member`
  ADD PRIMARY KEY (`member_id`),
  ADD KEY `family_id` (`family_id`);

--
-- Indexes for table `meeting`
--
ALTER TABLE `meeting`
  ADD PRIMARY KEY (`meeting_id`),
  ADD KEY `family_id` (`family_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `meeting_attendance`
--
ALTER TABLE `meeting_attendance`
  ADD PRIMARY KEY (`attendance_id`),
  ADD KEY `meeting_id` (`meeting_id`),
  ADD KEY `member_id` (`member_id`);

--
-- Indexes for table `packages`
--
ALTER TABLE `packages`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `payment`
--
ALTER TABLE `payment`
  ADD PRIMARY KEY (`payment_id`),
  ADD KEY `family_id` (`family_id`),
  ADD KEY `recorded_by` (`recorded_by`);

--
-- Indexes for table `system_admin`
--
ALTER TABLE `system_admin`
  ADD PRIMARY KEY (`admin_id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `activity_log`
--
ALTER TABLE `activity_log`
  MODIFY `log_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `chat_message`
--
ALTER TABLE `chat_message`
  MODIFY `message_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT for table `chat_room`
--
ALTER TABLE `chat_room`
  MODIFY `room_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `drive_file`
--
ALTER TABLE `drive_file`
  MODIFY `file_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `family`
--
ALTER TABLE `family`
  MODIFY `family_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT for table `family_drive`
--
ALTER TABLE `family_drive`
  MODIFY `drive_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `family_event`
--
ALTER TABLE `family_event`
  MODIFY `event_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `family_member`
--
ALTER TABLE `family_member`
  MODIFY `member_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=26;

--
-- AUTO_INCREMENT for table `meeting`
--
ALTER TABLE `meeting`
  MODIFY `meeting_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `meeting_attendance`
--
ALTER TABLE `meeting_attendance`
  MODIFY `attendance_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `packages`
--
ALTER TABLE `packages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `payment`
--
ALTER TABLE `payment`
  MODIFY `payment_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `system_admin`
--
ALTER TABLE `system_admin`
  MODIFY `admin_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `activity_log`
--
ALTER TABLE `activity_log`
  ADD CONSTRAINT `activity_log_ibfk_1` FOREIGN KEY (`member_id`) REFERENCES `family_member` (`member_id`);

--
-- Constraints for table `chat_message`
--
ALTER TABLE `chat_message`
  ADD CONSTRAINT `chat_message_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `chat_room` (`room_id`),
  ADD CONSTRAINT `chat_message_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `family_member` (`member_id`);

--
-- Constraints for table `chat_room`
--
ALTER TABLE `chat_room`
  ADD CONSTRAINT `chat_room_ibfk_1` FOREIGN KEY (`family_id`) REFERENCES `family` (`family_id`);

--
-- Constraints for table `drive_file`
--
ALTER TABLE `drive_file`
  ADD CONSTRAINT `drive_file_ibfk_1` FOREIGN KEY (`drive_id`) REFERENCES `family_drive` (`drive_id`),
  ADD CONSTRAINT `drive_file_ibfk_2` FOREIGN KEY (`uploaded_by`) REFERENCES `family_member` (`member_id`);

--
-- Constraints for table `family`
--
ALTER TABLE `family`
  ADD CONSTRAINT `family_ibfk_1` FOREIGN KEY (`registered_by`) REFERENCES `system_admin` (`admin_id`);

--
-- Constraints for table `family_drive`
--
ALTER TABLE `family_drive`
  ADD CONSTRAINT `family_drive_ibfk_1` FOREIGN KEY (`family_id`) REFERENCES `family` (`family_id`);

--
-- Constraints for table `family_event`
--
ALTER TABLE `family_event`
  ADD CONSTRAINT `family_event_ibfk_1` FOREIGN KEY (`family_id`) REFERENCES `family` (`family_id`),
  ADD CONSTRAINT `family_event_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `family_member` (`member_id`);

--
-- Constraints for table `family_member`
--
ALTER TABLE `family_member`
  ADD CONSTRAINT `family_member_ibfk_1` FOREIGN KEY (`family_id`) REFERENCES `family` (`family_id`);

--
-- Constraints for table `meeting`
--
ALTER TABLE `meeting`
  ADD CONSTRAINT `meeting_ibfk_1` FOREIGN KEY (`family_id`) REFERENCES `family` (`family_id`),
  ADD CONSTRAINT `meeting_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `family_member` (`member_id`);

--
-- Constraints for table `meeting_attendance`
--
ALTER TABLE `meeting_attendance`
  ADD CONSTRAINT `meeting_attendance_ibfk_1` FOREIGN KEY (`meeting_id`) REFERENCES `meeting` (`meeting_id`),
  ADD CONSTRAINT `meeting_attendance_ibfk_2` FOREIGN KEY (`member_id`) REFERENCES `family_member` (`member_id`);

--
-- Constraints for table `payment`
--
ALTER TABLE `payment`
  ADD CONSTRAINT `payment_ibfk_1` FOREIGN KEY (`family_id`) REFERENCES `family` (`family_id`),
  ADD CONSTRAINT `payment_ibfk_2` FOREIGN KEY (`recorded_by`) REFERENCES `family_member` (`member_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
