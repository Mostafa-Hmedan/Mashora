import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';

@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Public()
  @Get()
  list(@Query('specialty') specialty?: string) {
    return this.doctorsService.listApproved(specialty);
  }

  @Roles(Role.DOCTOR)
  @Get('me')
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.doctorsService.getOwnProfile(user.userId);
  }

  @Roles(Role.DOCTOR)
  @Patch('me')
  updateMyProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateDoctorProfileDto) {
    return this.doctorsService.updateOwnProfile(user.userId, dto);
  }

  @Public()
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.doctorsService.getApprovedById(id);
  }
}
