import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RejectDoctorDto } from './dto/review-doctor.dto';

@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('doctors/pending')
  listPending() {
    return this.adminService.listPendingDoctors();
  }

  @Get('doctors')
  listAll() {
    return this.adminService.listAllDoctors();
  }

  @Patch('doctors/:id/approve')
  approve(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string) {
    return this.adminService.approveDoctor(admin.userId, id);
  }

  @Patch('doctors/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDoctorDto) {
    return this.adminService.rejectDoctor(id, dto.reason);
  }

  @Patch('doctors/:id/suspend')
  suspend(@Param('id') id: string, @Body() dto: RejectDoctorDto) {
    return this.adminService.suspendDoctor(id, dto.reason);
  }

  @Get('bookings')
  listBookings() {
    return this.adminService.listAllBookings();
  }

  @Get('users')
  listUsers() {
    return this.adminService.listAllUsers();
  }

  @Patch('users/:id/activate')
  activateUser(@Param('id') id: string) {
    return this.adminService.setUserActive(id, true);
  }

  @Patch('users/:id/deactivate')
  deactivateUser(@Param('id') id: string) {
    return this.adminService.setUserActive(id, false);
  }
}
